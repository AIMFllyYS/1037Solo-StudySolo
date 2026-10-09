'use client'

import { useRef, useState } from 'react'

import { MarkdownStream } from '@/classolo/components/markdown'
import { getClassUserId } from '@/classolo/lib/db'
import { getRenderMessages, getTranscriptPublic } from '@/classolo/lib/session'
import { upsertRenderMessage } from '@/classolo/lib/session/writes/render'
import { useStore as useUiStore } from '@/lib/stores/ui'

import type { RenderMessage } from '../types'
import { answerClassQuestion, citedEvidenceIds, questionEvidence } from './answer'
import { aiAskPropsSchema, REVEAL_RESPONSE } from './schema'

type Props = typeof aiAskPropsSchema._output

function attemptTimestamp() { return Date.now() }

export function AiAskModule({ props, message, onAnchorClick }: { props: Props; message: RenderMessage<Props>; onAnchorClick?: (segmentId: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [response, setResponse] = useState('')
  const [working, setWorking] = useState(false)
  const [partial, setPartial] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const choices = props.choices ?? []
  const attempts = props.attempts ?? []
  const last = attempts.at(-1)
  const transcript = getTranscriptPublic()
  const sourceChanged = last?.evidenceIds.some(id => transcript.committed.find(row => row.id === id)?.correctionRevision !== last.sourceRevisions[id]) ?? false

  async function submit(reveal=false) {
    if (busy.current || (!reveal && ((choices.length > 0 && picked === null) || (choices.length === 0 && !response.trim())))) return
    const owner = getClassUserId(), sessionId = transcript.sessionId
    if (!owner || !sessionId) return
    const studentResponse = reveal?REVEAL_RESPONSE:choices.length > 0 ? `${String.fromCharCode(65 + picked!)}. ${choices[picked!]}` : response.trim()
    const sources = questionEvidence(transcript.committed, message.meta.transcriptAnchor)
    busy.current = true; setWorking(true); setPartial(''); setError('')
    try {
      const answer = await answerClassQuestion({question:props.question,choices,response:studentResponse,sources,onChunk:setPartial})
      if (owner !== getClassUserId() || sessionId !== getTranscriptPublic().sessionId) return
      const evidenceIds = citedEvidenceIds(answer,sources)
      const sourceRevisions = Object.fromEntries(evidenceIds.map(id => [id,sources.find(row => row.id === id)?.correctionRevision ?? 0]))
      const current = getRenderMessages(message.target).find(row => row.id === message.id) ?? message
      const currentProps = current.props as Props
      upsertRenderMessage({...current,props:{...currentProps,assessmentId:currentProps.assessmentId??message.id,attempts:[...(currentProps.attempts??[]).slice(-19),{id:crypto.randomUUID(),response:studentResponse,answer,evidenceIds,sourceRevisions,atMs:attemptTimestamp()}]}})
      setPartial('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '回答暂不可用，请重试') }
    finally { busy.current = false; setWorking(false) }
  }

  function followUp() {
    const context = last?.evidenceIds.length ? `参考文稿片段：${last.evidenceIds.map(id=>`[${id}]`).join('、')}` : '本题没有已核对的文稿引用'
    useUiStore.getState().sendToChat(`请继续讲解当前课堂中的这道题。课堂ID：${getTranscriptPublic().sessionId}；题目：${props.question}；我的作答：${last?.response||response}；卡片内解释：${last?.answer||'暂无'}；${context}。请结合本课文稿回答我的追问。`)
  }

  return <div data-slot="ai-ask" className="text-sm">
    <p className="font-medium text-[color:var(--ink)]">随堂提问</p>
    <MarkdownStream markdown={props.question} className="mt-1 text-[color:var(--ink)]" />
    {choices.length ? <div role="radiogroup" aria-label="选项" className="mt-2 flex flex-col gap-1.5">{choices.map((choice,index)=><button key={`${index}-${choice}`} type="button" role="radio" aria-checked={picked===index} onClick={()=>setPicked(index)} className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left ${picked===index?'border-[color:var(--accent)] bg-[color:var(--accent-weak)]':'border-[color:var(--line-soft)]'}`}><span className="font-mono text-[11px]">{String.fromCharCode(65+index)}</span><MarkdownStream markdown={choice} className="min-w-0 flex-1 [&_p]:my-0"/></button>)}</div> : <textarea aria-label="我的回答" value={response} onChange={event=>setResponse(event.target.value)} maxLength={4000} className="mt-2 min-h-16 w-full rounded-md border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-2" placeholder="写下你的理解，再查看参考答案"/>}
    <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" disabled={working || (choices.length>0?picked===null:!response.trim())} onClick={()=>void submit()} className="ss-tool">{working?'正在结合文稿回答…':last?'再次作答':'提交并查看答案'}</button>{!last&&<button type="button" disabled={working} onClick={()=>void submit(true)} className="ss-tool">直接看参考答案</button>}</div>
    {error&&<p role="alert" className="mt-2 text-[color:var(--error)]">{error}</p>}
    {working&&partial&&<div role="status" className="mt-3 rounded-md bg-[color:var(--bg-muted)] p-2"><MarkdownStream markdown={partial}/></div>}
    {last&&<section className="mt-3 rounded-md border border-[color:var(--line-soft)] p-2" aria-label="本题答案"><p className="text-[11px] text-[color:var(--ink-faint)]">{last.response===REVEAL_RESPONSE?'参考答案':`最近作答：${last.response}`}</p><MarkdownStream markdown={last.answer} className="mt-1"/>{sourceChanged&&<p role="status" className="text-[11px]">文稿已更正，请重新核对本题解释。</p>}{last.evidenceIds.length?<div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">依据文稿：{last.evidenceIds.map(id=><button type="button" key={id} className="ss-tool" onClick={()=>onAnchorClick?.(id)}>{id.slice(0,8)}</button>)}</div>:<p className="mt-2 text-[11px] text-[color:var(--ink-faint)]">本题没有可核对的文稿引用；解释属于助教补充。</p>}<button type="button" className="ss-tool mt-2" onClick={followUp}>向课堂助教追问</button></section>}
  </div>
}
