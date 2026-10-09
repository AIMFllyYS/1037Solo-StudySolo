import {z} from 'zod'
import {createModel,generateText,tool} from '@/classolo/lib/ai'
import {getRenderMessages,getTranscriptPublic} from '@/classolo/lib/session'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {getClassUserId} from '@/classolo/lib/db'
import {REVEAL_RESPONSE} from '@/classolo/features/render-modules/ai-ask/schema'
import {answerClassQuestion,citedEvidenceIds,questionEvidence} from '@/classolo/features/render-modules/ai-ask/answer'

const questionSchema=z.object({question:z.string().min(6).max(500),choices:z.array(z.string().min(1).max(200)).min(2).max(4).optional()})
const pending=new Map<string,Promise<void>>()

/** A bounded, cited question for the left study rail; the answer is generated on reveal. */
export function generateClassQuestion():Promise<void>{
  const snapshot=getTranscriptPublic(),owner=getClassUserId(),sessionId=snapshot.sessionId
  if(!owner||!sessionId||!snapshot.committed.length)return Promise.reject(new Error('先录入本课文稿，再生成随堂题'))
  const key=`${owner}:${sessionId}`
  const existing=pending.get(key);if(existing)return existing
  const task=(async()=>{
    const sources=snapshot.committed.slice(-5)
    const previous=getRenderMessages('transcript').filter(row=>row.module==='ai-ask').slice(-4).map(row=>String((row.props as {question?:unknown}).question??''))
    const result=await generateText({
      model:createModel({baseUrl:'',model:'classroom'}),
      system:'你是课堂助教。只依据给定文稿出一道新的、可用文稿核对的理解题。优先问因果关系或易混概念。只调用 makeQuestion，不输出正文。不能用医学示例作诊断。',
      prompt:`最近文稿：\n${sources.map(row=>`[${row.id}] ${row.text.slice(0,1800)}`).join('\n')}\n已有题目（避免重复）：${previous.join('；')||'无'}`,
      tools:{makeQuestion:tool({description:'提出一道随堂理解题，可用二至四个选项或开放题。',inputSchema:questionSchema,execute:async input=>input})},
      toolChoice:{type:'tool',toolName:'makeQuestion'},
      maxOutputTokens:700,maxRetries:0,
    })
    const raw=result.toolCalls.find(call=>call.toolName==='makeQuestion')?.input
    const parsed=questionSchema.safeParse(raw)
    if(!parsed.success)throw new Error('助教未生成可核对的题目，请重试')
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    const id=crypto.randomUUID()
    // 出题时顺带生成参考答案：题目一出现就是「已显示答案」的状态。答案失败不影响出题（学生仍可点「直接看参考答案」补取）。
    const anchor=sources.at(-1)?.id
    let attempts:Array<{id:string;response:string;answer:string;evidenceIds:string[];sourceRevisions:Record<string,number>;atMs:number}>|undefined
    try{
      const evidence=questionEvidence(getTranscriptPublic().committed,anchor)
      const answer=await answerClassQuestion({question:parsed.data.question,choices:parsed.data.choices??[],response:REVEAL_RESPONSE,sources:evidence,onChunk:()=>{}})
      const evidenceIds=citedEvidenceIds(answer,evidence)
      attempts=[{id:crypto.randomUUID(),response:REVEAL_RESPONSE,answer,evidenceIds,sourceRevisions:Object.fromEntries(evidenceIds.map(eid=>[eid,evidence.find(row=>row.id===eid)?.correctionRevision??0])),atMs:Date.now()}]
    }catch{/* keep the question; the answer can be revealed manually */}
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    upsertRenderMessage({id,module:'ai-ask',version:'1.0',target:'transcript',props:{...parsed.data,assessmentId:id,questionType:parsed.data.choices?'choice':'open',...(attempts?{attempts}:{})},meta:{createdAt:Date.now(),source:'silent-agent',transcriptAnchor:anchor}})
  })().finally(()=>pending.delete(key))
  pending.set(key,task)
  return task
}
