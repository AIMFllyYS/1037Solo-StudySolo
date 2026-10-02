import {z} from 'zod'
import {createModel,generateText,tool} from '@/classolo/lib/ai'
import {getRenderMessages,getTranscriptPublic} from '@/classolo/lib/session'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {getClassUserId} from '@/classolo/lib/db'

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
    upsertRenderMessage({id,module:'ai-ask',version:'1.0',target:'transcript',props:{...parsed.data,assessmentId:id,questionType:parsed.data.choices?'choice':'open'},meta:{createdAt:Date.now(),source:'silent-agent',transcriptAnchor:sources.at(-1)?.id}})
  })().finally(()=>pending.delete(key))
  pending.set(key,task)
  return task
}
