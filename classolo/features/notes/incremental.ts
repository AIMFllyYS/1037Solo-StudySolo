import {z} from 'zod'
import {outlineNodeSchema,outlineSchema} from '@/classolo/lib/session/outline-schema'
import type {OutlineDigestNode,OutlineProgress,TranscriptCommittedSegment} from '@/classolo/lib/session/types'
import {stableOutlineId} from './hierarchy'
import {formulaProposalSchema} from '@/classolo/features/formulas/schema'

export interface OutlineEvidence {id:string;seq:number;text:string;startChar:number;endChar:number;fingerprint:string}
export const OUTLINE_BATCH_CHARS=6000
const fingerprints=new WeakMap<object,string>()
export function sourceFingerprint(segment:TranscriptCommittedSegment){
  let value=fingerprints.get(segment)
  if(!value){value=`${segment.text.length}:${stableOutlineId(null,segment.text)}`;fingerprints.set(segment,value)}
  return value
}
/** Read every unfinished segment, including recovered earlier gaps; never skip to the last N. */
export function nextOutlineBatch(segments:readonly TranscriptCommittedSegment[],progress:OutlineProgress={}):OutlineEvidence[]{
  const out:OutlineEvidence[]=[];let budget=OUTLINE_BATCH_CHARS
  for(const segment of segments){
    const hash=sourceFingerprint(segment),saved=progress[segment.id]
    let offset=saved?.fingerprint===hash?Math.min(saved.chars,segment.text.length):0
    while(offset<segment.text.length&&budget>0&&out.length<16){
      const end=Math.min(segment.text.length,offset+Math.min(2000,budget))
      out.push({id:segment.id,seq:segment.seq,text:segment.text.slice(offset,end),startChar:offset,endChar:end,fingerprint:hash})
      budget-=end-offset;offset=end
    }
    if(budget<=0||out.length>=16)break
  }
  return out
}
export function advanceOutlineProgress(progress:OutlineProgress,evidence:readonly OutlineEvidence[]):OutlineProgress{
  const next={...progress};for(const row of evidence)next[row.id]={chars:row.endChar,fingerprint:row.fingerprint};return next
}
export function outlineProgressStats(segments:readonly TranscriptCommittedSegment[],progress:OutlineProgress={}){
  let completed=0
  for(const segment of segments)if(progress[segment.id]?.fingerprint===sourceFingerprint(segment)&&progress[segment.id].chars>=segment.text.length)completed++
  return {completed,total:segments.length}
}

const patchSchema=z.object({nodes:z.array(outlineNodeSchema.omit({origin:true,locked:true}).extend({sourceSegmentIds:z.array(z.string().min(1).max(150)).min(1).max(100)})).max(80)})
const analysisSchema=patchSchema.extend({formulas:z.array(formulaProposalSchema).max(10).optional()})
export function parseOutlineAnalysis(text:string){
  const start=text.indexOf('{'),end=text.lastIndexOf('}')
  if(start<0||end<start)throw new Error('导图更新不是合法JSON')
  return analysisSchema.parse(JSON.parse(text.slice(start,end+1)))
}
export function parseOutlinePatch(text:string){return parseOutlineAnalysis(text).nodes}

/** Model IDs for new nodes are temporary; established IDs and locked user edits are preserved. */
export function applyOutlinePatch(existing:readonly OutlineDigestNode[],raw:unknown,allowedSources:ReadonlySet<string>):readonly OutlineDigestNode[]{
  const incoming=patchSchema.parse({nodes:raw}).nodes
  if(new Set(incoming.map(node=>node.id)).size!==incoming.length)throw new Error('导图更新ID重复')
  for(const node of incoming)if(node.sourceSegmentIds.some(id=>!allowedSources.has(id)))throw new Error('导图来源不属于当前课堂')
  const old=new Map(existing.map(node=>[node.id,node])),patches=new Map(incoming.map(node=>[node.id,node]))
  const ids=new Map<string,string>(),visiting=new Set<string>()
  const signature=(parent:string|null|undefined,title:string)=>`${parent??''}\0${title.trim()}`
  const signatures=new Map(existing.map(node=>[signature(node.parentId,node.title),node.id]))
  function resolve(id:string):string {
    const known=ids.get(id);if(known)return known
    if(old.has(id)){ids.set(id,id);return id}
    const patch=patches.get(id);if(!patch)throw new Error('导图父节点不存在')
    if(visiting.has(id))throw new Error('导图更新存在循环');visiting.add(id)
    const parent=patch.parentId?resolve(patch.parentId):null
    const key=signature(parent,patch.title),value=signatures.get(key)??crypto.randomUUID()
    signatures.set(key,value);ids.set(id,value);visiting.delete(id);return value
  }
  const merged=new Map(old)
  for(const patch of incoming){
    const id=resolve(patch.id),previous=merged.get(id)
    if(previous?.locked||previous?.origin==='manual')continue
    const sources=[...new Set([...(previous?.sourceSegmentIds||[]),...patch.sourceSegmentIds])].slice(-100)
    const parentId=patch.parentId?resolve(patch.parentId):null
    if(previous&&signatures.get(signature(previous.parentId,previous.title))===id)signatures.delete(signature(previous.parentId,previous.title))
    signatures.set(signature(parentId,patch.title),id)
    merged.set(id,{...previous,id,title:patch.title,parentId,sourceSegmentIds:sources,origin:'ai'})
  }
  outlineSchema.parse({nodes:[...merged.values()]})
  return [...merged.values()]
}

export function outlinePrompt(previous:readonly OutlineDigestNode[],evidence:readonly OutlineEvidence[],subjectLabel?:string):string{
  return `${subjectLabel?`课堂学科：${subjectLabel}。学科只帮助辨识术语，内容以文稿为准。\n`:''}`+
    '根据新增课堂文稿增量更新已有导图。保留先前主题，不输出删除操作，不改学生固定节点。只输出JSON：'+
    '{"nodes":[{"id":"已有节点ID或新节点临时ID","title":"主题或要点","parentId":null,"sourceSegmentIds":["文稿真实ID"]}]}。'+
    '每个新增/更新节点必须给出本次文稿或已有课堂文稿中的真实来源ID；修改标题/父级时保留已有节点ID。新增子节点可引用同批临时父ID。'+
    '若老师口述数学或化学公式，另在formulas返回最多10个候选：'+
    '{"sourceSegmentId":"本课真实片段ID","spokenText":"文稿中的原句","latex":"不含美元符号的LaTeX","alternatives":[]}。'+
    '口述有歧义时列出不同写法，不凭空确定；没有公式则返回空数组。不要把你补充的内容当成老师原话。'+
    '没有值得加入的新知识可返回nodes空数组。已有节点只提供titlePreview定位，未需修改时不要返回该节点或改短原有完整标题。已有节点最多300个，请组织主题和子点，避免重复节点。\n'+
    JSON.stringify({existing:previous.map(node=>({id:node.id,titlePreview:node.title.slice(0,32),parentId:node.parentId??null,locked:!!node.locked||node.origin==='manual'})),newTranscript:evidence.map(row=>({id:row.id,seq:row.seq,text:row.text}))})
}
