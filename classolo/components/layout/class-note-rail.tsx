'use client'

import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {ArrowLeftRight,ChevronLeft,ChevronRight,Lightbulb,MessageCircleQuestion,NotebookPen,RefreshCw,Sparkles} from 'lucide-react'
import {useNotesPublic,useRenderProjection,useTranscriptPublic} from '@/classolo/lib/session'
import {RenderHost} from '@/classolo/features/render-modules/host'
import {generateClassQuestion} from '@/classolo/features/agent/class-question'
import {generateClassVisual} from '@/classolo/features/agent/class-visual'

export function ClassNoteRail({note,collapsed,onToggle,onFlip,onAsk}:{note:ReactNode;collapsed:boolean;onToggle:()=>void;onFlip:()=>void;onAsk:()=>void}){
  const projection=useRenderProjection(state=>state.byId)
  const sessionId=useTranscriptPublic(state=>state.sessionId)
  const segments=useTranscriptPublic(state=>state.committed.length)
  const outline=useNotesPublic(state=>state.outlineDigest)
  const thinkingCue=useMemo(()=>{
    const related=outline.filter(row=>row.parentId).slice(0,2)
    if(related.length<2)return outline[0]?.title?`想一想：你能用自己的话解释「${outline[0].title}」吗？`:null
    return `想一想：「${related[0].title}」与「${related[1].title}」有什么联系或区别？`
  },[outline])
  const counts=useMemo(()=>Object.values(projection).reduce((out,row)=>{
    if(row.module==='ai-ask'&&row.target==='transcript')out.questions++
    if(row.target==='notes'&&['rich-text','gen-ui','agent-status'].includes(row.module))out.thinking++
    return out
  },{questions:0,thinking:0}),[projection])
  const [working,setWorking]=useState(false),[error,setError]=useState('')
  const [visualWorking,setVisualWorking]=useState(false),[visualError,setVisualError]=useState('')
  const attempted=useRef<string|null>(null)
  const askForQuestion=()=>{
    if(working)return
    setWorking(true);setError('')
    void generateClassQuestion().catch(cause=>setError(cause instanceof Error?cause.message:'出题暂不可用')).finally(()=>setWorking(false))
  }
  const drawVisual=()=>{
    if(visualWorking)return
    setVisualWorking(true);setVisualError('')
    void generateClassVisual().catch(cause=>setVisualError(cause instanceof Error?cause.message:'可视化暂不可用')).finally(()=>setVisualWorking(false))
  }
  useEffect(()=>{
    if(collapsed||!sessionId||!segments||counts.questions||attempted.current===sessionId)return
    attempted.current=sessionId
    askForQuestion()
    // Generate once on opening this lesson; further questions are student-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[collapsed,sessionId,segments,counts.questions])
  if(collapsed)return <aside data-slot="class-note-rail" className="ss-class-side-rail is-collapsed"><div className="flex h-full flex-col items-center gap-2 py-3"><button type="button" aria-label="展开笔记侧栏" onClick={onToggle}><ChevronRight className="size-4"/></button><button type="button" aria-label="切换到课堂列表" onClick={onFlip}><ArrowLeftRight className="size-4"/></button><button type="button" aria-label="向课堂助教提问" className="mt-auto" onClick={onAsk}><MessageCircleQuestion className="size-4"/></button></div></aside>
  return <aside data-slot="class-note-rail" className="ss-class-side-rail flex h-full min-h-0 flex-col">
    <header className="ss-class-side-head"><span className="ss-class-side-kicker"><NotebookPen className="size-3.5"/> AI 课堂笔记</span><button type="button" aria-label="切换到课堂列表" title="切换到课堂列表" onClick={onFlip}><ArrowLeftRight className="size-3.5"/></button><button type="button" aria-label="收起笔记侧栏" onClick={onToggle}><ChevronLeft className="size-3.5"/></button></header>
    <div className="min-h-0 flex-1 overflow-hidden">{note}</div>
    <section className="ss-class-thinking-rail" aria-label="课堂思考引导">
      <div className="ss-class-side-subhead"><Lightbulb className="size-3.5"/> 思考引导 <button type="button" className="ss-class-icon-button ml-auto" aria-label="生成可视化说明" title="生成可视化说明" disabled={visualWorking||!segments} onClick={drawVisual}><Sparkles className={`size-3 ${visualWorking?'animate-pulse':''}`}/></button><button type="button" className="ss-tool" onClick={onAsk}>追问助教</button></div>
      <div className="ss-class-thinking-body">{counts.thinking?<RenderHost target="notes" modules={['rich-text','gen-ui','agent-status']} compact limit={1}/>:<p>{thinkingCue??'课堂开始后，这里会出现关联概念的思考提示。'}</p>}{visualWorking&&<p role="status" className="mt-1">正在绘制课堂示意图…</p>}{visualError&&<p role="alert" className="mt-1 text-[color:var(--md-sys-color-error)]">{visualError}</p>}</div>
    </section>
    <section className="ss-class-question-rail" aria-label="随堂提问与答案">
      <div className="ss-class-side-subhead"><MessageCircleQuestion className="size-3.5"/> 随堂提问 <span>{counts.questions} 题</span><button type="button" className="ss-class-icon-button" aria-label="生成下一题" title="生成下一题" disabled={working||!segments} onClick={askForQuestion}><RefreshCw className={`size-3 ${working?'animate-spin':''}`}/></button></div>
      <div className="ss-class-question-body">{counts.questions?<RenderHost target="transcript" modules={['ai-ask']} compact limit={1}/>:<p>{working?'正在根据本课文稿出题…':'有了课堂文稿后，AI 会提出第一道可核对的理解题。'}</p>}{error&&<p role="alert" className="mt-2 text-[color:var(--md-sys-color-error)]">{error}</p>}</div>
    </section>
  </aside>
}
