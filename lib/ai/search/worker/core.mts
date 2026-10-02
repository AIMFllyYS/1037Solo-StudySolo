import {tokenize,type RuntimeBm25Index} from '../../indexing/bm25Index.js'

export interface CoreChunkMeta{id:string;path:string;subjectId:string;subjectName:string;categoryId:string;itemId:string;title:string;chunkIndex:number;text:string}
export interface CoreHit extends CoreChunkMeta{score:number}
export type SubjectFilter=(subjectId:string)=>boolean
const K1=1.5,B=0.75

export function createBm25Scanner(index:RuntimeBm25Index,metaById:ReadonlyMap<string,CoreChunkMeta>,query:string,topK:number,allowed:SubjectFilter){
  const terms=tokenize(query),limit=Math.max(0,Math.floor(topK))
  type Candidate={id:string;score:number;order:number}
  const heap:Candidate[]=[]
  const worse=(a:Candidate,b:Candidate)=>a.score<b.score||(a.score===b.score&&a.order>b.order)
  const push=(candidate:Candidate)=>{
    if(heap.length<limit){heap.push(candidate);for(let child=heap.length-1;child>0;){const parent=Math.floor((child-1)/2);if(!worse(heap[child],heap[parent]))break;[heap[child],heap[parent]]=[heap[parent],heap[child]];child=parent}return}
    if(!worse(heap[0],candidate))return
    heap[0]=candidate
    for(let parent=0;parent<heap.length;){const left=parent*2+1,right=left+1;let worst=parent;if(left<heap.length&&worse(heap[left],heap[worst]))worst=left;if(right<heap.length&&worse(heap[right],heap[worst]))worst=right;if(worst===parent)break;[heap[parent],heap[worst]]=[heap[worst],heap[parent]];parent=worst}
  }
  function* work(){
    if(!terms.length||!limit)return
    if(index.format==='compact'){
      const scores=new Float64Array(index.ids.length),seen=new Uint8Array(index.ids.length),touched:number[]=[]
      for(const term of terms){const entry=index.invertedIndex[term];if(!entry)continue
        const idf=Math.log((index.docCount-entry.df+0.5)/(entry.df+0.5)+1)
        for(let at=0;at+1<entry.postings.length;at+=2){
          const docIndex=entry.postings[at],tf=entry.postings[at+1],id=index.ids[docIndex]
          if(id&&allowed(metaById.get(id)?.subjectId??'')){
            if(!seen[docIndex]){seen[docIndex]=1;touched.push(docIndex)}
            const docLen=index.docLengths[docIndex]||1
            scores[docIndex]+=idf*((tf*(K1+1))/(tf+K1*(1-B+B*(docLen/Math.max(index.avgDocLen,1)))))
          }
          yield
        }
      }
      for(const docIndex of touched){push({id:index.ids[docIndex],score:scores[docIndex],order:docIndex});yield}
    }else{
      const scores:Record<string,number>={}
      for(const term of terms){const entry=index.invertedIndex[term];if(!entry)continue
        const idf=Math.log((index.docCount-entry.df+0.5)/(entry.df+0.5)+1)
        for(const posting of entry.postings){
          if(allowed(metaById.get(posting.id)?.subjectId??'')){
            const docLen=index.docLengths[posting.id]||1,tf=posting.tf
            scores[posting.id]=(scores[posting.id]||0)+idf*((tf*(K1+1))/(tf+K1*(1-B+B*(docLen/Math.max(index.avgDocLen,1)))))
          }
          yield
        }
      }
      let order=0
      for(const [id,score] of Object.entries(scores)){push({id,score,order:order++});yield}
    }
  }
  const iterator=work()
  return {step(maxOps=256){for(let count=0;count<Math.max(1,maxOps);count++)if(iterator.next().done)return true;return false},result():CoreHit[]{return heap.sort((a,b)=>b.score-a.score||a.order-b.order).map(({id,score})=>({...metaById.get(id)??{id,path:id.split('#')[0],subjectId:'',subjectName:'',categoryId:'',itemId:'',title:'',chunkIndex:0,text:''},score}))}}
}
export function scoreBm25Core(index:RuntimeBm25Index,metaById:ReadonlyMap<string,CoreChunkMeta>,query:string,topK:number,allowed:SubjectFilter):CoreHit[]{
  const scanner=createBm25Scanner(index,metaById,query,topK,allowed)
  while(!scanner.step(Number.MAX_SAFE_INTEGER)){}
  return scanner.result()
}

export interface CoreVectorIndex{ids:readonly string[];dimension:number;matrix:Float32Array;norms:Float32Array;metaList:readonly (CoreChunkMeta|undefined)[]}
export function createVectorScanner(index:CoreVectorIndex,query:readonly number[],topK:number,allowed:SubjectFilter){
  if(query.length!==index.dimension||topK<=0)return {step:()=>true,result:()=>[] as CoreHit[]}
  const limit=Math.floor(topK),heap:CoreHit[]=[]
  let qNorm=0;for(const value of query)qNorm+=value*value;qNorm=Math.sqrt(qNorm)
  const worse=(a:CoreHit,b:CoreHit)=>a.score<b.score
  let cursor=0
  return {step(maxRows=256){
    const end=Math.min(index.ids.length,cursor+Math.max(1,maxRows))
    for(;cursor<end;cursor++){
      const meta=index.metaList[cursor];if(!meta||!allowed(meta.subjectId))continue
      const denom=qNorm*index.norms[cursor],offset=cursor*index.dimension
      let dot=0;if(denom)for(let col=0;col<index.dimension;col++)dot+=query[col]*index.matrix[offset+col]
      const candidate={...meta,score:denom?dot/denom:0}
      if(heap.length<limit){heap.push(candidate);for(let child=heap.length-1;child>0;){const parent=Math.floor((child-1)/2);if(!worse(heap[child],heap[parent]))break;[heap[child],heap[parent]]=[heap[parent],heap[child]];child=parent}continue}
      if(candidate.score<=heap[0].score)continue
      heap[0]=candidate
      for(let parent=0;parent<heap.length;){const left=parent*2+1,right=left+1;let worst=parent;if(left<heap.length&&worse(heap[left],heap[worst]))worst=left;if(right<heap.length&&worse(heap[right],heap[worst]))worst=right;if(worst===parent)break;[heap[parent],heap[worst]]=[heap[worst],heap[parent]];parent=worst}
    }
    return cursor>=index.ids.length
  },result(){return heap.sort((a,b)=>b.score-a.score)}}
}
export function scoreVectorCore(index:CoreVectorIndex,query:readonly number[],topK:number,allowed:SubjectFilter):CoreHit[]{
  const scanner=createVectorScanner(index,query,topK,allowed)
  while(!scanner.step(index.ids.length||1)){}
  return scanner.result()
}
