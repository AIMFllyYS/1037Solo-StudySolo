/** Synthetic S5 baseline. No embeddings, rerank, web API or user corpus are called. */
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {monitorEventLoopDelay,performance} from 'node:perf_hooks'
import {resolve} from 'node:path'

const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'baseline'
const workerMode=process.argv.includes('--worker')
const runId=new Date().toISOString().replace(/[:.]/g,'-')
const output=resolve('artifacts/performance',runId),indexDir=resolve(output,'index')
await mkdir(indexDir,{recursive:true})
const rows=Array.from({length:2000},(_,index)=>({id:`synthetic-${index}#0`,path:`physics/detail/synthetic-${index}`,subjectId:index%2?'anatomy':'physics',subjectName:index%2?'Anatomy':'Physics',categoryId:'detail',itemId:`synthetic-${index}`,title:index%3?'牛顿运动':'力学基础',chunkIndex:0,text:`synthetic fixture ${index} 牛顿 力学 ${index%7?'惯性':'质量'} `}))
const fixtureHash=createHash('sha256').update(rows.map(row=>`${row.id}:${row.text.length}`).join('|')).digest('hex')
const {buildCompactBm25Index}=await import('../../lib/ai/indexing/bm25Index.ts')
const bm25=buildCompactBm25Index(rows);bm25.builtAt='2026-10-02T00:00:00.000Z'
const vectors=Buffer.allocUnsafeSlow(rows.length*8*4)
for(let row=0;row<rows.length;row++)for(let col=0;col<8;col++)vectors.writeFloatLE(((row+col)%17+1)/17,(row*8+col)*4)
await Promise.all([
  writeFile(resolve(indexDir,'bm25.json'),JSON.stringify(bm25)),
  writeFile(resolve(indexDir,'chunks-meta.json'),JSON.stringify({chunks:rows})),
  writeFile(resolve(indexDir,'vectors.ids.json'),JSON.stringify(rows.map(row=>row.id))),
  writeFile(resolve(indexDir,'vectors.bin'),vectors),
  writeFile(resolve(indexDir,'manifest.json'),JSON.stringify({version:2,builtAt:bm25.builtAt,embeddingModel:'synthetic-8d',dimension:8,chunkCount:rows.length,vectorCount:rows.length,contentHash:fixtureHash,files:[]})),
])
process.env.SEARCH_INDEX_DIR=indexDir
const [{rrfMerge},local]=await Promise.all([import('../../lib/ai/search/hybridSearch.ts'),workerMode?import('../../lib/ai/search/searchService.ts'):Promise.all([import('../../lib/ai/search/bm25Store.ts'),import('../../lib/ai/search/vectorStore.ts')])])
const bm25Search=workerMode?(query,topK,filter)=>local.searchLocalIndex({mode:'keyword',query,topK,filter}):local[0].bm25Search
const vectorSearch=workerMode?(vector,topK,filter)=>local.searchLocalIndex({mode:'vector',query:'',queryVector:vector,topK,filter}):local[1].vectorSearch
const clock=monitorEventLoopDelay({resolution:10});clock.enable()
const measure=async(name,run)=>{const start=performance.now(),hits=await run();await new Promise(resolve=>setImmediate(resolve));return {name,elapsedMs:performance.now()-start,hits:hits.map(({id,score})=>({id,score}))}}
globalThis.gc?.()
const before=process.memoryUsage()
const keywordCold=await measure('keyword-cold',()=>bm25Search('牛顿 力学',10,{subjectId:'physics'}))
const keywordWarm=await measure('keyword-warm',()=>bm25Search('牛顿 力学',10,{subjectId:'physics'}))
const vectorCold=await measure('vector-cold',()=>vectorSearch(Array(8).fill(1),10,{subjectId:'physics'}))
const vectorWarm=await measure('vector-warm',()=>vectorSearch(Array(8).fill(1),10,{subjectId:'physics'}))
const localHybrid=await measure('local-rrf-no-provider',async()=>rrfMerge([await bm25Search('牛顿 力学',10,{subjectId:'physics'}),await vectorSearch(Array(8).fill(1),10,{subjectId:'physics'})]).slice(0,10))
clock.disable();globalThis.gc?.()
const after=process.memoryUsage(),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
const report={schemaVersion:1,scenario:'S5',label,runId,commit,fixtureHash,node:process.version,indexDir,mode:workerMode?'worker':'main',fixtures:{rows:rows.length,dimension:8,synthetic:true},before:{rss:before.rss,heapUsed:before.heapUsed,external:before.external,arrayBuffers:before.arrayBuffers},after:{rss:after.rss,heapUsed:after.heapUsed,external:after.external,arrayBuffers:after.arrayBuffers},steps:[keywordCold,keywordWarm,vectorCold,vectorWarm,localHybrid],eventLoop:{p95Ms:clock.percentile(95)/1e6,maxMs:clock.max/1e6},errors:0,exitCode:0,notes:['No paid embedding or rerank was called','external already includes arrayBuffers','local RRF is not the full provider-backed hybrid endpoint',workerMode?'Worker heap is separate; RSS includes the whole process':'Indices loaded on main thread']}
await writeFile(resolve(output,`${label}-search.json`),JSON.stringify(report,null,2))
process.stdout.write(JSON.stringify({output,fixtureHash,steps:report.steps.map(({name,elapsedMs,hits})=>({name,elapsedMs,hitCount:hits.length})),before:report.before,after:report.after})+'\n')
if(workerMode)await local.shutdownSearchWorker()
