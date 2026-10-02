import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Worker} from 'node:worker_threads'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {buildCompactBm25Index} from '@/lib/ai/indexing/bm25Index'

const indexDir=resolve('artifacts/performance/worker-contract-fixture')
function fixture(count=32){
  mkdirSync(indexDir,{recursive:true})
  const rows=Array.from({length:count},(_,index)=>({id:`fixture-${index}#0`,path:`physics/detail/${index}`,subjectId:index%2?'anatomy':'physics',subjectName:index%2?'Anatomy':'Physics',categoryId:'detail',itemId:String(index),title:'牛顿运动',chunkIndex:0,text:`synthetic 牛顿 ${index}`}))
  writeFileSync(resolve(indexDir,'chunks-meta.json'),JSON.stringify({chunks:rows}))
  writeFileSync(resolve(indexDir,'bm25.json'),JSON.stringify(buildCompactBm25Index(rows)))
  writeFileSync(resolve(indexDir,'vectors.ids.json'),JSON.stringify(rows.map(row=>row.id)))
  const bytes=Buffer.allocUnsafeSlow(rows.length*8*4)
  for(let row=0;row<rows.length;row++)for(let col=0;col<8;col++)bytes.writeFloatLE((row+col+1)/40,(row*8+col)*4)
  writeFileSync(resolve(indexDir,'vectors.bin'),bytes)
  writeFileSync(resolve(indexDir,'manifest.json'),JSON.stringify({version:2,builtAt:'2026-10-02',dimension:8,embeddingModel:'synthetic-8d'}))
}
type Reply={type:string;jobId?:string;hits?:{id:string}[];diagnostics?:{bm25Reads:number;vectorReads:number;metadataReads:number};error?:string}
function openWorker(){return new Worker(resolve('runtime/search-worker/search/worker/index.mjs'),{workerData:{indexDir,indexRevision:'fixture-revision'}})}
function next(worker:Worker,predicate:(reply:Reply)=>boolean):Promise<Reply>{return new Promise((resolveReply,reject)=>{const timeout=setTimeout(()=>{worker.off('message',onMessage);reject(new Error('worker response timeout'))},5000);const onMessage=(reply:Reply)=>{if(!predicate(reply))return;clearTimeout(timeout);worker.off('message',onMessage);resolveReply(reply)};worker.on('message',onMessage)})}
test('compiled worker owns the indices and skips the unrequested mode',async()=>{
  fixture();const worker=openWorker()
  try{
    await next(worker,reply=>reply.type==='ready')
    const keyword=next(worker,reply=>reply.jobId==='keyword'&&reply.type!=='started')
    worker.postMessage({type:'search',job:{jobId:'keyword',indexRevision:'fixture-revision',mode:'keyword',query:'牛顿',filter:{subjectId:'physics'},topK:5}})
    const first=await keyword
    assert.equal(first.type,'result');assert.equal(first.hits?.length,5)
    assert.equal(first.diagnostics?.bm25Reads,1);assert.equal(first.diagnostics?.vectorReads,0);assert.equal(first.diagnostics?.metadataReads,1)
    const vector=next(worker,reply=>reply.jobId==='vector'&&reply.type!=='started')
    worker.postMessage({type:'search',job:{jobId:'vector',indexRevision:'fixture-revision',mode:'vector',query:'',queryVector:Array(8).fill(1),filter:{subjectId:'physics'},topK:5}})
    const second=await vector
    assert.equal(second.type,'result');assert.equal(second.diagnostics?.bm25Reads,1);assert.equal(second.diagnostics?.vectorReads,1)
  }finally{await worker.terminate()}
})
test('a running CPU search observes cancellation at a cooperative yield',async()=>{
  fixture(5000);const worker=openWorker()
  try{
    await next(worker,reply=>reply.type==='ready')
    const started=next(worker,reply=>reply.type==='started'&&reply.jobId==='long')
    worker.postMessage({type:'search',job:{jobId:'long',indexRevision:'fixture-revision',mode:'keyword',query:'牛顿',filter:{},topK:5}})
    await started
    const outcome=next(worker,reply=>reply.jobId==='long'&&(reply.type==='aborted'||reply.type==='result'))
    worker.postMessage({type:'cancel',jobId:'long'})
    assert.equal((await outcome).type,'aborted')
  }finally{await worker.terminate()}
})
