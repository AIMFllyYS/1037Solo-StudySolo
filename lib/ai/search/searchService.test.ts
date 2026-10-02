import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {buildCompactBm25Index} from '@/lib/ai/indexing/bm25Index'
import {getResourceSnapshot} from '@/lib/performance/resourceMetrics'
import {localSearchAvailability,searchLocalIndex,resolveSearchWorkerEntry,shutdownSearchWorker} from './searchService.ts'

const dir=resolve('artifacts/performance/search-service-fixture')
function fixture(){
  mkdirSync(dir,{recursive:true})
  const rows=Array.from({length:500},(_,index)=>({id:`worker-${index}#0`,path:`physics/detail/${index}`,subjectId:index%2?'anatomy':'physics',subjectName:'Synthetic',categoryId:'detail',itemId:String(index),title:'牛顿运动',chunkIndex:0,text:`牛顿 力学 synthetic ${index}`}))
  writeFileSync(resolve(dir,'chunks-meta.json'),JSON.stringify({chunks:rows}))
  writeFileSync(resolve(dir,'bm25.json'),JSON.stringify(buildCompactBm25Index(rows)))
  writeFileSync(resolve(dir,'vectors.ids.json'),JSON.stringify(rows.map(row=>row.id)))
  const bytes=Buffer.allocUnsafeSlow(rows.length*8*4)
  for(let row=0;row<rows.length;row++)for(let col=0;col<8;col++)bytes.writeFloatLE((row+col+1)/100,(row*8+col)*4)
  writeFileSync(resolve(dir,'vectors.bin'),bytes)
  writeFileSync(resolve(dir,'manifest.json'),JSON.stringify({version:2,builtAt:'2026-10-02',embeddingModel:'synthetic-8d',dimension:8,contentHash:'worker-fixture-v1'}))
}
test('search facade owns one worker, bounds 20 concurrent jobs and removes an aborted pending job',async()=>{
  fixture();const previous=process.env.SEARCH_INDEX_DIR;process.env.SEARCH_INDEX_DIR=dir
  try{
    const first=await searchLocalIndex({mode:'keyword',query:'牛顿',topK:5,filter:{subjectId:'physics'}})
    assert.equal(first.length,5)
    assert.equal(getResourceSnapshot().searchWorkerCount,1)
    const controller=new AbortController()
    const jobs=Array.from({length:20},(_,index)=>searchLocalIndex({mode:'keyword',query:`牛顿 ${index}`,topK:5,signal:index===15?controller.signal:undefined}))
    controller.abort()
    const outcomes=await Promise.allSettled(jobs)
    assert.ok(outcomes.some(outcome=>outcome.status==='rejected'&&(outcome.reason as Error).name==='AbortError'))
    assert.ok(outcomes.some(outcome=>outcome.status==='rejected'&&(outcome.reason as Error).message==='search_busy'))
    assert.equal(getResourceSnapshot().searchPendingJobs,0)
    assert.equal(getResourceSnapshot().searchWorkerCount,1)
  }finally{await shutdownSearchWorker();if(previous===undefined)delete process.env.SEARCH_INDEX_DIR;else process.env.SEARCH_INDEX_DIR=previous}
  assert.equal(getResourceSnapshot().searchWorkerCount,0)
})
test('worker entry resolves from an explicit root when cwd changes',()=>{
  const cwd=process.cwd(),root=resolve('runtime/search-worker'),previous=process.env.STUDYSOLO_SEARCH_WORKER_ROOT
  try{process.env.STUDYSOLO_SEARCH_WORKER_ROOT=root;process.chdir(resolve('artifacts/performance'));assert.ok(resolveSearchWorkerEntry().startsWith(root))}
  finally{process.chdir(cwd);if(previous===undefined)delete process.env.STUDYSOLO_SEARCH_WORKER_ROOT;else process.env.STUDYSOLO_SEARCH_WORKER_ROOT=previous}
})
test('a crashed worker rejects its job and a later local request builds one replacement',async()=>{
  fixture();const previous=process.env.SEARCH_INDEX_DIR;process.env.SEARCH_INDEX_DIR=dir
  try{
    await searchLocalIndex({mode:'keyword',query:'牛顿',topK:3})
    const state=(globalThis as typeof globalThis&Record<symbol,unknown>)[Symbol.for('studysolo.search.worker.v1')] as {worker:{terminate():Promise<number>}}
    await state.worker.terminate()
    const recovered=await searchLocalIndex({mode:'keyword',query:'牛顿',topK:3})
    assert.equal(recovered.length,3)
    assert.equal(getResourceSnapshot().searchWorkerCount,1)
  }finally{await shutdownSearchWorker();if(previous===undefined)delete process.env.SEARCH_INDEX_DIR;else process.env.SEARCH_INDEX_DIR=previous}
})

test('BM25-only CI index does not advertise an empty vector file as available',()=>{
  const empty=resolve('artifacts/performance/search-empty-fixture'),previous=process.env.SEARCH_INDEX_DIR
  mkdirSync(empty,{recursive:true})
  writeFileSync(resolve(empty,'manifest.json'),JSON.stringify({version:2,dimension:0,chunkCount:1,vectorCount:0,contentHash:'a'.repeat(64)}))
  writeFileSync(resolve(empty,'bm25.json'),'{}')
  writeFileSync(resolve(empty,'vectors.bin'),Buffer.alloc(0))
  writeFileSync(resolve(empty,'vectors.ids.json'),'[]')
  try{process.env.SEARCH_INDEX_DIR=empty;assert.equal(localSearchAvailability('keyword'),true);assert.equal(localSearchAvailability('vector'),false)}
  finally{if(previous===undefined)delete process.env.SEARCH_INDEX_DIR;else process.env.SEARCH_INDEX_DIR=previous}
})
