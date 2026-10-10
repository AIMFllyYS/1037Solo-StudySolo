// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({files:new Map<string,Buffer>(),reads:[] as string[],metaCalls:0}))
vi.mock('@/lib/ai/search/indexes/indexIo',()=>({INDEX_FILES:{bm25:'bm25.json',chunksMeta:'chunks-meta.json'},readLocalIndexFile:(name:string)=>{f.reads.push(name);return f.files.get(name)??null},getChunkMetadataIndex:()=>{f.metaCalls++;const rows=JSON.parse(f.files.get('chunks-meta.json')!.toString('utf8')).chunks;return {rows,byId:new Map(rows.map((row:{id:string})=>[row.id,row]))}}}))
import {buildCompactBm25Index} from '@/lib/ai/indexing/bm25Index'

const rows=[
  {id:'physics/detail/1#0',title:'大学物理 > 详解 > 牛顿运动',text:'牛顿定律说明力和加速度',subjectId:'physics'},
  {id:'anatomy/detail/2#0',title:'解剖 > 详解 > 肌肉运动',text:'骨骼肌收缩',subjectId:'anatomy'},
  {id:'physics/detail/3#0',title:'大学物理 > 详解 > 牛顿力学',text:'牛顿第二定律与质量',subjectId:'physics'},
]
beforeEach(()=>{f.files.clear();f.reads.length=0;f.metaCalls=0;f.files.set('chunks-meta.json',Buffer.from(JSON.stringify({chunks:rows.map(row=>({...row,path:row.id.split('#')[0],subjectName:row.subjectId,categoryId:'detail',itemId:row.id,chunkIndex:0}))})))})

it('compact numeric postings match the legacy scoring oracle with filtering and topK',async()=>{
  const compact=buildCompactBm25Index(rows)
  f.files.set('bm25.json',Buffer.from(JSON.stringify(compact)))
  vi.resetModules()
  const modern=(await import('./bm25Store')).bm25Search
  const compactHits=await modern('牛顿',2,{subjectId:'physics'})
  expect(f.metaCalls).toBe(1)
  f.reads.length=0
  f.metaCalls=0
  const legacy={builtAt:compact.builtAt,avgDocLen:compact.avgDocLen,docCount:compact.docCount,
    invertedIndex:Object.fromEntries(Object.entries(compact.invertedIndex).map(([term,entry])=>[term,{df:entry.df,postings:Array.from({length:entry.p.length/2},(_,index)=>({id:compact.ids[entry.p[index*2]],tf:entry.p[index*2+1]}))}])),
    docLengths:Object.fromEntries(compact.ids.map((id,index)=>[id,compact.docLengths[index]]))}
  f.files.set('bm25.json',Buffer.from(JSON.stringify(legacy)))
  vi.resetModules()
  const old=(await import('./bm25Store')).bm25Search
  const oldHits=await old('牛顿',2,{subjectId:'physics'})
  expect(compactHits.map(hit=>hit.id)).toEqual(oldHits.map(hit=>hit.id))
  for(let index=0;index<oldHits.length;index++)expect(compactHits[index].score).toBeCloseTo(oldHits[index].score,10)
  expect(compactHits.every(hit=>hit.subjectId==='physics')).toBe(true)
  expect(f.metaCalls).toBe(1)
})
