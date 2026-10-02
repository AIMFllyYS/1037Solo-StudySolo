/** Synthetic, offline Node memory scenario. Run with `node --import tsx --expose-gc`. */
import 'fake-indexeddb/auto'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {monitorEventLoopDelay,performance} from 'node:perf_hooks'
import {resolve} from 'node:path'

const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'sample'
const runId=new Date().toISOString().replace(/[:.]/g,'-')
const output=resolve('artifacts/performance',runId)
const digest=value=>createHash('sha256').update(value).digest('hex')
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
const startCommit=git('rev-parse','HEAD')
const dirtyFingerprint=digest(git('status','--porcelain'))
const storage=new Map()
globalThis.window={addEventListener(){},removeEventListener(){}}
globalThis.document={addEventListener(){},removeEventListener(){},visibilityState:'visible'}
globalThis.localStorage={
  get length(){return storage.size},
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key),
  key:index=>[...storage.keys()][index]??null,
  clear:()=>storage.clear(),
}
const [{activateStorageOwner,ownedStorageKey},{chatSessionKey},{useChatHistory},{getResourceSnapshot}]=await Promise.all([
  import('../../lib/storage/ownerScope.ts'),import('../../lib/storage/idbStorage.ts'),import('../../lib/stores/chatHistory.ts'),import('../../lib/performance/resourceMetrics.ts'),
])
activateStorageOwner('00000000-0000-4000-8000-000000000001')
const message=(id,role,text)=>({id,role,parts:[{type:'text',text}],timestamp:1})
const metas=[]
const fixtureSignature=[]
for(let i=0;i<100;i++){
  const id=`synthetic-${i}`
  const suffix=i%4===0?'\\frac{1}{2} + \\ce{H2O}':i%4===1?'tool result '+('Z'.repeat(2048)):i%4===2?'中文课堂概念 '.repeat(90):'plain response '.repeat(90)
  const messages=[message(`${id}-u`,'user',`synthetic question ${i}`),message(`${id}-a`,'assistant',suffix)]
  storage.set(ownedStorageKey(chatSessionKey(id)),JSON.stringify(messages))
  metas.push({id,title:`Fixture ${i}`,createdAt:i+1,updatedAt:i+1,messageCount:2,artifactIds:[]})
  fixtureSignature.push(`${id}:${suffix.length}`)
}
const fixtureHash=digest(fixtureSignature.join('|'))
useChatHistory.setState({sessionsMeta:metas,messagesById:{},sessionWindowById:{},activeSessionId:'synthetic-0',sessionLoadState:{},loadedSessionIds:[],pinnedSessionIds:[],_hasHydrated:true,_activeMessagesReady:true})
const trace=[]
const clock=monitorEventLoopDelay({resolution:20});clock.enable()
const sample=(step)=>{
  const resources=getResourceSnapshot()
  globalThis.gc?.()
  const memory=process.memoryUsage(),state=useChatHistory.getState()
  trace.push({step,elapsedMs:Math.round(performance.now()),residentSessions:Object.keys(state.messagesById).length,lruIds:state.loadedSessionIds.length,windowEntries:Object.keys(state.sessionWindowById).length,resources,rss:memory.rss,heapUsed:memory.heapUsed,external:memory.external,arrayBuffers:memory.arrayBuffers,storageKeys:storage.size})
}
sample('cold')
for(let i=0;i<5;i++)await useChatHistory.getState().ensureSessionLoaded(`synthetic-${i}`)
sample('warm-5')
for(let i=0;i<100;i++)await useChatHistory.getState().ensureSessionLoaded(`synthetic-${i}`)
sample('rotated-100')
clock.disable()
const result={schemaVersion:1,scenario:'S1',label,runId,commit:startCommit,dirtyFingerprint,node:process.version,platform:process.platform,fixtureHash,fixture:{sessions:100,messagesPerSession:2,warm:5,rotations:100},samples:trace,eventLoop:{meanMs:Number.isFinite(clock.mean)?clock.mean/1e6:null,p95Ms:clock.percentile(95)/1e6,maxMs:clock.max/1e6},errors:0,exitCode:0,measurementNotes:['synthetic fixture in fake-indexeddb, not browser IndexedDB performance','heapUsed measured after explicit GC when available','external includes arrayBuffers; do not add them','RSS includes the whole Node process, not browser or Electron']}
await mkdir(output,{recursive:true})
await writeFile(resolve(output,`${label}-node.json`),JSON.stringify(result,null,2),'utf8')
process.stdout.write(JSON.stringify({output,commit:startCommit,fixtureHash,samples:trace.map(({step,residentSessions,lruIds,rss,heapUsed})=>({step,residentSessions,lruIds,rss,heapUsed}))})+'\n')
