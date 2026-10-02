import {z} from 'zod'
import {stableOutlineId} from '@/classolo/features/notes/hierarchy'
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'

export const termCorrectionCandidateSchema=z.object({
  id:z.string().min(1).max(150),segmentId:z.string().min(1).max(150),
  start:z.number().int().nonnegative().max(20000),end:z.number().int().positive().max(20000),
  heard:z.string().min(3).max(40),term:z.string().min(3).max(40),
})
export type TermCorrectionCandidate=z.infer<typeof termCorrectionCandidateSchema>
export const correctionHistorySchema=z.object({
  id:z.string().min(1).max(150),kind:z.enum(['term','manual']),
  start:z.number().int().nonnegative().max(20000),before:z.string().max(20000),after:z.string().max(20000),
  atMs:z.number().int().nonnegative(),
})
export type CorrectionHistoryEntry=z.infer<typeof correctionHistorySchema>
export const correctionRecordSchema=z.object({
  sessionId:z.string().uuid(),segmentId:z.string().uuid(),revision:z.number().int().nonnegative(),
  correctedText:z.string().max(20000),history:z.array(correctionHistorySchema).max(64),
  actionHash:z.string().regex(/^[0-9a-f]{64}$/).optional(),
})
export type CorrectionRecord=z.infer<typeof correctionRecordSchema>
export const correctionActionSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('term'),candidateId:z.string().min(1).max(150),atMs:z.number().int().nonnegative().optional()}),
  z.object({kind:z.literal('manual'),text:z.string().max(20000),atMs:z.number().int().nonnegative().optional()}),
  z.object({kind:z.literal('undo'),atMs:z.number().int().nonnegative().optional()}),z.object({kind:z.literal('reset'),atMs:z.number().int().nonnegative().optional()}),
])
export type CorrectionAction=z.infer<typeof correctionActionSchema>

const sensitive=/[0-9０-９不无未非否±%‰]/u
function oneSubstitution(heard:string,term:string):boolean{
  if(heard.length!==term.length)return false
  let changes=0
  for(let i=0;i<term.length;i++)if(heard[i]!==term[i]){
    if(sensitive.test(heard[i])||sensitive.test(term[i]))return false
    if(++changes>1)return false
  }
  return changes===1
}
/** A cue for human review; this never changes the ASR text on its own. */
export function suggestTermCorrections(segmentId:string,text:string,terms:readonly string[]):TermCorrectionCandidate[]{
  const accepted=new Set(terms.map(term=>term.trim()).filter(term=>term.length>=3&&term.length<=40&&!/[0-9０-９]/u.test(term)))
  const out:TermCorrectionCandidate[]=[],seen=new Set<string>()
  for(const term of accepted){
    if(term.length>text.length)continue
    for(let start=0;start<=text.length-term.length;start++){
      if(out.length>=8)return out
      const heard=text.slice(start,start+term.length)
      if(accepted.has(heard)||!oneSubstitution(heard,term))continue
      const key=`${start}:${heard}:${term}`
      if(seen.has(key))continue
      seen.add(key)
      out.push({id:`term-${stableOutlineId(null,`${segmentId}\0${key}`)}`,segmentId,start,end:start+heard.length,heard,term})
    }
  }
  return out
}

export function applyTermCorrection(text:string,candidate:TermCorrectionCandidate,history:readonly CorrectionHistoryEntry[]=[],atMs=Date.now()){
  const parsed=termCorrectionCandidateSchema.parse(candidate)
  if(text.slice(parsed.start,parsed.end)!==parsed.heard||parsed.start>=parsed.end)throw new Error('文稿已变化，请重新检查术语')
  const next=text.slice(0,parsed.start)+parsed.term+text.slice(parsed.end)
  return {text:next,history:[...history,{id:parsed.id,kind:'term' as const,start:parsed.start,before:parsed.heard,after:parsed.term,atMs}].slice(-64)}
}

/** A deliberate text edit remains clearly marked as student edited. Original ASR text is separate. */
export function applyManualCorrection(text:string,replacement:string,history:readonly CorrectionHistoryEntry[]=[],atMs=Date.now()){
  if(replacement.length>20000||replacement===text)throw new Error('请填写不同的文稿内容（最多20000字）')
  let start=0;while(start<text.length&&start<replacement.length&&text[start]===replacement[start])start++
  let left=text.length,right=replacement.length
  while(left>start&&right>start&&text[left-1]===replacement[right-1]){left--;right--}
  const before=text.slice(start,left),after=replacement.slice(start,right)
  return {text:replacement,history:[...history,{id:`manual-${stableOutlineId(null,`${start}\0${before}\0${after}\0${atMs}`)}`,kind:'manual' as const,start,before,after,atMs}].slice(-64)}
}
export function undoLastCorrection(text:string,history:readonly CorrectionHistoryEntry[]){
  const last=history.at(-1);if(!last)throw new Error('没有可撤回的校正')
  if(text.slice(last.start,last.start+last.after.length)!==last.after)throw new Error('文稿已变化，请重新加载')
  return {text:text.slice(0,last.start)+last.before+text.slice(last.start+last.after.length),history:history.slice(0,-1)}
}

export function planTranscriptCorrection(input:{sessionId:string;segmentId:string;rawText:string;previous?:CorrectionRecord|null;profile:ClassCourseProfile;action:CorrectionAction}):CorrectionRecord{
  const action=correctionActionSchema.parse(input.action),previous=input.previous
  const text=previous?.correctedText??input.rawText,history=previous?.history??[]
  let next:{text:string;history:CorrectionHistoryEntry[]}
  if(action.kind==='term'){
    const candidate=suggestTermCorrections(input.segmentId,text,planClassHotwords(input.profile).accepted).find(row=>row.id===action.candidateId)
    if(!candidate)throw new Error('术语候选已变化，请重新检查')
    next=applyTermCorrection(text,candidate,history,action.atMs)
  }else if(action.kind==='manual')next=applyManualCorrection(text,action.text,history,action.atMs)
  else if(action.kind==='undo')next=undoLastCorrection(text,history)
  else{
    if(text===input.rawText&&history.length===0)throw new Error('当前已是原始文稿')
    next={text:input.rawText,history:[]}
  }
  return correctionRecordSchema.parse({sessionId:input.sessionId,segmentId:input.segmentId,revision:(previous?.revision??0)+1,correctedText:next.text,history:next.history})
}
