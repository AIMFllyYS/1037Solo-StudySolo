import {existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {Worker} from 'node:worker_threads'
import {getLocalIndexDir,INDEX_FILES,parseManifest,readLocalIndexFile} from './indexes/indexIo'
import type {SearchFilter} from './searchScope'
import type {ScoredChunk} from './indexes/vectorStoreTypes'
import {subjectVisibleToAgent} from '@/lib/constants/academic-year'
import {SUBJECT_REGISTRY} from '@/lib/content-data/subjects.registry'
import {offlineSubjectIds} from '@/lib/content/offlineSubjects'
import {DEFAULT_RESOURCE_BUDGETS} from '@/lib/performance/budgets'
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics'

type Mode='keyword'|'vector'|'hybrid'
interface Job{jobId:string;indexRevision:string;mode:Mode;query:string;queryVector?:number[];filter:{subjectId?:string;allowedSubjects?:string[]};topK:number}
type Reply={type:'ready'|'started'|'result'|'error'|'aborted';jobId?:string;hits?:ScoredChunk[];diagnostics?:Record<string,number>;error?:string;indexRevision?:string}
interface Pending{job:Job;bytes:number;resolve:(hits:ScoredChunk[])=>void;reject:(error:Error)=>void;signal?:AbortSignal;onAbort?:()=>void;settled:boolean}
interface WorkerRegistry{worker:Worker;indexDir:string;revision:string;ready:Promise<void>;resolveReady:()=>void;rejectReady:(error:Error)=>void;pending:Map<string,Pending>;queue:string[];active:string|null;bytes:number;closed:boolean}
const REGISTRY=Symbol.for('studysolo.search.worker.v1'),METRICS=Symbol.for('studysolo.search.worker.metrics.v1')
type Globals=typeof globalThis&{[REGISTRY]?:WorkerRegistry;[METRICS]?:()=>void}
const globals=globalThis as Globals
if(!globals[METRICS])globals[METRICS]=registerResourceMetrics(()=>{const state=globals[REGISTRY];return {searchWorkerCount:state&&!state.closed?1:0,searchPendingJobs:state&&!state.closed?state.pending.size:0}})

export class SearchBusyError extends Error{constructor(){super('search_busy');this.name='SearchBusyError'}}
function abortError(){const error=new Error('Search cancelled');error.name='AbortError';return error}
function entryPath(){
  const relative=join('search','worker','index.mjs')
  const resourcesPath=(process as NodeJS.Process&{resourcesPath?:string}).resourcesPath
  const roots=[process.env.STUDYSOLO_SEARCH_WORKER_ROOT,resolve(process.cwd(),'runtime/search-worker'),resolve(process.cwd(),'.next/standalone/runtime/search-worker'),resourcesPath?resolve(resourcesPath,'standalone/runtime/search-worker'):undefined].filter((value):value is string=>!!value)
  const found=roots.map(root=>resolve(root,relative)).find(existsSync)
  if(!found)throw new Error('search_worker_unavailable: run npm run compile:search-worker')
  return found
}
export function resolveSearchWorkerEntry(){return entryPath()}
function revision(){const manifest=parseManifest(readLocalIndexFile(INDEX_FILES.manifest));return manifest?.contentHash||manifest?.builtAt||'legacy-index'}
export function localSearchAvailability(mode:Mode):boolean{
  const dir=getLocalIndexDir()
  const keyword=existsSync(join(dir,INDEX_FILES.bm25))
  const manifest=parseManifest(readLocalIndexFile(INDEX_FILES.manifest))
  const explicitlyEmpty=manifest&&(manifest.vectorCount===0||manifest.dimension===0)
  const vector=!explicitlyEmpty&&((existsSync(join(dir,INDEX_FILES.vectorsBin))&&existsSync(join(dir,INDEX_FILES.vectorsIds)))||existsSync(join(dir,INDEX_FILES.vectorsJson)))
  return mode==='keyword'?keyword:mode==='vector'?vector:keyword||vector
}
export function localVectorModel(){return parseManifest(readLocalIndexFile(INDEX_FILES.manifest))?.embeddingModel||process.env.AI_EMBEDDING_MODEL||'BAAI/bge-m3'}
export function localIndexBuiltAt(){return parseManifest(readLocalIndexFile(INDEX_FILES.manifest))?.builtAt}
function close(state:WorkerRegistry,error:Error){
  if(state.closed)return;state.closed=true
  state.rejectReady(error)
  for(const pending of state.pending.values()){pending.signal?.removeEventListener('abort',pending.onAbort!);if(!pending.settled)pending.reject(error)}
  state.pending.clear();state.queue.length=0;state.active=null;state.bytes=0
  void state.worker.terminate()
  if(globals[REGISTRY]===state)delete globals[REGISTRY]
}
function dispatch(state:WorkerRegistry){
  if(state.closed||state.active)return
  const next=state.queue.shift();if(!next){state.worker.unref();return}
  const pending=state.pending.get(next);if(!pending){dispatch(state);return}
  state.active=next
  state.worker.ref()
  state.worker.postMessage({type:'search',job:pending.job})
}
function settle(state:WorkerRegistry,reply:Reply){
  const id=reply.jobId;if(!id)return
  const pending=state.pending.get(id)
  if(state.active===id)state.active=null
  if(pending){
    state.pending.delete(id);state.bytes=Math.max(0,state.bytes-pending.bytes)
    if(pending.onAbort)pending.signal?.removeEventListener('abort',pending.onAbort)
    if(!pending.settled){pending.settled=true;if(reply.type==='result')pending.resolve(reply.hits??[]);else pending.reject(reply.type==='aborted'?abortError():new Error(reply.error||'search_failed'))}
  }
  dispatch(state)
}
function createRegistry(indexDir:string,indexRevision:string):WorkerRegistry{
  let resolveReady:()=>void=()=>{},rejectReady:(error:Error)=>void=()=>{}
  const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
  const worker=new Worker(entryPath(),{workerData:{indexDir,indexRevision}})
  const state:WorkerRegistry={worker,indexDir,revision:indexRevision,ready,resolveReady,rejectReady,pending:new Map(),queue:[],active:null,bytes:0,closed:false}
  worker.on('message',(reply:Reply)=>{if(reply.type==='ready'){state.resolveReady();dispatch(state)}else if(reply.type!=='started')settle(state,reply)})
  worker.on('error',error=>close(state,error))
  worker.on('exit',code=>{if(!state.closed)close(state,new Error(`search_worker_exited:${code}`))})
  return state
}
function workerRegistry(){
  const indexDir=getLocalIndexDir(),indexRevision=revision(),existing=globals[REGISTRY]
  if(existing&&!existing.closed&&existing.indexDir===indexDir&&existing.revision===indexRevision)return existing
  if(existing)close(existing,new Error('index_revision_changed'))
  const created=createRegistry(indexDir,indexRevision);globals[REGISTRY]=created;return created
}
function checkedFilter(filter:SearchFilter):Job['filter']{
  const offline=offlineSubjectIds(),scoped=filter.academicYear&&filter.academicYear!=='all'
  const allowedSubjects=scoped||offline.length?SUBJECT_REGISTRY.filter(subject=>(!scoped||subjectVisibleToAgent(subject.id,filter.academicYear!))&&(!offline.length||offline.includes(subject.id))).map(subject=>subject.id):undefined
  return {...(filter.subjectId?{subjectId:filter.subjectId}:{}),...(allowedSubjects?{allowedSubjects}:{})}
}
export async function searchLocalIndex(input:{mode:Mode;query:string;queryVector?:number[];topK:number;filter?:SearchFilter;signal?:AbortSignal}):Promise<ScoredChunk[]>{
  if(input.signal?.aborted)throw abortError()
  if(input.query.length>2000||!Number.isInteger(input.topK)||input.topK<1||input.topK>200)throw new Error('invalid_search_job')
  const dimension=parseManifest(readLocalIndexFile(INDEX_FILES.manifest))?.dimension
  if(input.mode!=='keyword'&&(!input.queryVector||input.queryVector.length>4096||input.queryVector.some(value=>!Number.isFinite(value))||(dimension&&input.queryVector.length!==dimension)))throw new Error('invalid_search_vector')
  const job:Job={jobId:crypto.randomUUID(),indexRevision:revision(),mode:input.mode,query:input.query,queryVector:input.queryVector,filter:checkedFilter(input.filter??{}),topK:input.topK}
  const bytes=job.query.length*2+(job.queryVector?.length??0)*8+(job.filter.allowedSubjects?.join('').length??0)*2+256
  const state=workerRegistry()
  if(state.queue.length>=DEFAULT_RESOURCE_BUDGETS.searchPendingJobs||state.bytes+bytes>DEFAULT_RESOURCE_BUDGETS.searchPendingBytes)throw new SearchBusyError()
  return new Promise<ScoredChunk[]>((resolveHits,reject)=>{
    const pending:Pending={job,bytes,resolve:resolveHits,reject,signal:input.signal,settled:false}
    pending.onAbort=()=>{
      if(pending.settled)return
      pending.settled=true;pending.reject(abortError())
      const index=state.queue.indexOf(job.jobId)
      if(index>=0){state.queue.splice(index,1);state.pending.delete(job.jobId);state.bytes-=bytes}
      else if(state.active===job.jobId)state.worker.postMessage({type:'cancel',jobId:job.jobId})
    }
    input.signal?.addEventListener('abort',pending.onAbort,{once:true})
    state.pending.set(job.jobId,pending);state.queue.push(job.jobId);state.bytes+=bytes
    void state.ready.then(()=>dispatch(state)).catch(error=>close(state,error))
  })
}
export async function shutdownSearchWorker(){const state=globals[REGISTRY];if(state){close(state,new Error('search_worker_shutdown'));await state.worker.terminate()}}
