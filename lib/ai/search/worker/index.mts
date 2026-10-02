import {parentPort,workerData} from 'node:worker_threads'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {parseBm25Index,type RuntimeBm25Index} from '../../indexing/bm25Index.js'
import {createBm25Scanner,createVectorScanner,type CoreChunkMeta,type CoreVectorIndex,type CoreHit} from './core.mjs'

type Mode='keyword'|'vector'|'hybrid'
type Filter={subjectId?:string;allowedSubjects?:string[]}
type Job={jobId:string;indexRevision:string;mode:Mode;query:string;queryVector?:number[];filter:Filter;topK:number}
type Message={type:'search';job:Job}|{type:'cancel';jobId:string}|{type:'shutdown'}
const port=parentPort
if(!port)throw new Error('search worker requires parent port')
const indexDir=String((workerData as {indexDir?:unknown}).indexDir??'')
const indexRevision=String((workerData as {indexRevision?:unknown}).indexRevision??'')
if(!indexDir)throw new Error('search index directory is missing')
let meta:Map<string,CoreChunkMeta>|null=null,metaReads=0,bm25:RuntimeBm25Index|null=null,bm25Reads=0,vectors:(CoreVectorIndex&{sourceBuffer:Buffer})|null=null,vectorReads=0
const cancelled=new Set<string>(),queue:Job[]=[]
let running=false
const read=(name:string)=>readFileSync(join(indexDir,name))
function metadata(){if(meta)return meta;const parsed=JSON.parse(read('chunks-meta.json').toString('utf8')) as {chunks?:CoreChunkMeta[]}|CoreChunkMeta[];const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.chunks)?parsed.chunks:[];meta=new Map(rows.filter(row=>row?.id).map(row=>[row.id,row]));metaReads++;return meta}
function bm25Index(){if(bm25)return bm25;const parsed=parseBm25Index(JSON.parse(read('bm25.json').toString('utf8')));if(!parsed)throw new Error('invalid_bm25_index');bm25=parsed;bm25Reads++;return bm25}
function vectorIndex(){
  if(vectors)return vectors
  const ids=JSON.parse(read('vectors.ids.json').toString('utf8')) as string[]
  const buffer=read('vectors.bin'),manifest=JSON.parse(read('manifest.json').toString('utf8')) as {dimension?:number}
  const dimension=manifest.dimension??0
  if(!Array.isArray(ids)||!ids.length||dimension<8||buffer.byteLength!==ids.length*dimension*4)throw new Error('invalid_vector_index')
  const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1
  let matrix:Float32Array
  if(littleEndian&&buffer.byteOffset%4===0)matrix=new Float32Array(buffer.buffer,buffer.byteOffset,buffer.byteLength/4)
  else{const copy=new Uint8Array(buffer.byteLength);copy.set(buffer);matrix=new Float32Array(copy.buffer)}
  const byId=metadata(),norms=new Float32Array(ids.length),metaList=ids.map(id=>byId.get(id))
  for(let row=0;row<ids.length;row++){let sum=0;for(let col=0;col<dimension;col++){const value=matrix[row*dimension+col];sum+=value*value}norms[row]=Math.sqrt(sum)}
  vectors={ids,dimension,matrix,norms,metaList,sourceBuffer:buffer};vectorReads++
  return vectors
}
function mergeRankings(rankings:CoreHit[][]):CoreHit[]{
  const scores=new Map<string,{hit:CoreHit;score:number}>()
  for(const ranking of rankings)for(let index=0;index<ranking.length;index++){const hit=ranking[index],old=scores.get(hit.id);if(old)old.score+=1/(61+index);else scores.set(hit.id,{hit,score:1/(61+index)})}
  return [...scores.values()].sort((a,b)=>b.score-a.score).map(item=>({...item.hit,score:item.score}))
}
async function execute(job:Job){
  if(job.indexRevision!==indexRevision)throw new Error('index_revision_mismatch')
  const byId=metadata(),allow=(subjectId:string)=>!job.filter.subjectId||subjectId===job.filter.subjectId
  const permitted=(subjectId:string)=>allow(subjectId)&&(!job.filter.allowedSubjects||job.filter.allowedSubjects.includes(subjectId))
  let bm:CoreHit[]=[]
  if(job.mode!=='vector'){
    const scanner=createBm25Scanner(bm25Index(),byId,job.query,job.topK,permitted)
    while(!scanner.step(256)){
      await new Promise<void>(resolve=>setImmediate(resolve))
      if(cancelled.has(job.jobId))throw new Error('search_aborted')
    }
    bm=scanner.result()
  }
  let vec:CoreHit[]=[]
  if(job.mode!=='keyword'){
    const scanner=createVectorScanner(vectorIndex(),job.queryVector??[],job.topK,permitted)
    while(!scanner.step(256)){
      await new Promise<void>(resolve=>setImmediate(resolve))
      if(cancelled.has(job.jobId))throw new Error('search_aborted')
    }
    vec=scanner.result()
  }
  const hits=job.mode==='hybrid'?mergeRankings([bm,vec]).slice(0,job.topK):job.mode==='keyword'?bm:vec
  return {hits,diagnostics:{bm25Hits:bm.length,vecHits:vec.length,merged:hits.length,metadataReads:metaReads,bm25Reads,vectorReads}}
}
async function drain(){
  if(running)return;running=true
  try{while(queue.length){const job=queue.shift()!
    if(cancelled.delete(job.jobId)){port!.postMessage({type:'aborted',jobId:job.jobId});continue}
    await new Promise<void>(resolve=>setImmediate(resolve))
    if(cancelled.delete(job.jobId)){port!.postMessage({type:'aborted',jobId:job.jobId});continue}
    port!.postMessage({type:'started',jobId:job.jobId})
    try{const result=await execute(job);if(cancelled.delete(job.jobId))port!.postMessage({type:'aborted',jobId:job.jobId});else port!.postMessage({type:'result',jobId:job.jobId,...result})}
    catch(error){if(cancelled.delete(job.jobId))port!.postMessage({type:'aborted',jobId:job.jobId});else port!.postMessage({type:'error',jobId:job.jobId,error:error instanceof Error?error.message:'search_failed'})}
  }}finally{running=false}
}
port.on('message',(message:Message)=>{
  if(message.type==='shutdown'){queue.length=0;port.close();return}
  if(message.type==='cancel'){cancelled.add(message.jobId);const index=queue.findIndex(job=>job.jobId===message.jobId);if(index>=0){queue.splice(index,1);cancelled.delete(message.jobId);port.postMessage({type:'aborted',jobId:message.jobId})}return}
  if(queue.length>=16){port.postMessage({type:'error',jobId:message.job.jobId,error:'search_busy'});return}
  queue.push(message.job);void drain()
})
port.postMessage({type:'ready',indexRevision})
