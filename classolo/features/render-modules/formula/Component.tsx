'use client'
import {useState} from 'react'
import {getClassUserId} from '@/classolo/lib/db'
import {getTranscriptPublic,useTranscriptPublic} from '@/classolo/lib/session'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {MarkdownStream} from '@/classolo/components/markdown'
import type {FormulaProps} from '@/classolo/features/formulas/schema'
import type {RenderMessage} from '../types'

export function FormulaModule({props,message}:{props:FormulaProps;message:RenderMessage<FormulaProps>;onAnchorClick?:(id:string)=>void}){
  const source=useTranscriptPublic(state=>state.committed.find(segment=>segment.id===props.sourceSegmentId))
  const sessionId=useTranscriptPublic(state=>state.sessionId)
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(props.latex),[error,setError]=useState('')
  const stale=!source||(source.correctionRevision??0)!==props.sourceRevision
  const confirmed=props.studentConfirmed&&!stale
  function update(next:FormulaProps){upsertRenderMessage({...message,props:next})}
  async function saveLatex(){
    const owner=getClassUserId(),session=sessionId
    try{
      const {validateFormulaProposal}=await import('@/classolo/features/formulas/validate')
      const current=getTranscriptPublic().committed.find(row=>row.id===props.sourceSegmentId)
      if(!owner||owner!==getClassUserId()||session!==getTranscriptPublic().sessionId||!current)throw new Error('课堂已切换，请重新打开公式')
      const checked=validateFormulaProposal({sourceSegmentId:props.sourceSegmentId,spokenText:props.spokenText,latex:draft,alternatives:[]},current.text,current.correctionRevision??0)
      update({...checked,id:message.id,studentConfirmed:false,locked:true});setEditing(false);setError('')
    }catch(cause){setError(cause instanceof Error?cause.message:'公式检查失败')}
  }
  return <section className="space-y-2" data-slot="class-formula">
    <p className="text-[12px] font-medium">课堂公式候选</p>
    <div className="flex flex-wrap gap-2 text-[11px]"><span>{props.renderStatus==='valid'?'排版可渲染':'排版需要修改'}</span><span>{props.semanticStatus==='checked'?'有理数等式已检验':props.semanticStatus==='invalid'?'数值检查未通过':props.semanticStatus==='ambiguous'?'口述有歧义':'数学意义尚未检验'}</span><span>{stale?'来源文稿已变化，需重新核对':props.sourceStatus==='matched'?'已找到文稿口述':'未在来源片段找到口述'}</span>{confirmed&&<span>学生已确认与课堂来源一致</span>}</div>
    {props.renderStatus==='valid'?<div className="max-w-full overflow-x-auto"><MarkdownStream markdown={`$$\n${props.latex}\n$$`}/></div>:<code className="block whitespace-pre-wrap text-[12px]">{props.latex}</code>}
    <p className="text-[11px] text-[color:var(--ink-faint)]">口述记录：{props.spokenText}</p>
    {props.alternatives?.length?<div className="flex flex-wrap items-center gap-2 text-[11px]"><span>口述有歧义，可选择写法并核对：</span>{props.alternatives.map(option=><button key={option} type="button" className="rounded border border-[color:var(--line-soft)] px-2 py-1" onClick={()=>{setDraft(option);setEditing(true)}}>{option}</button>)}</div>:null}
    <p className="text-[11px] text-[color:var(--ink-faint)]">{props.renderError||props.semanticDetail}</p>
    <div className="flex flex-wrap gap-2 text-[11px]"><button type="button" className="ss-tool" disabled={stale||props.renderStatus==='invalid'||props.sourceStatus!=='matched'} onClick={()=>update({...props,studentConfirmed:true,locked:true})}>确认与课堂原文一致</button><button type="button" className="ss-tool" onClick={()=>{setEditing(value=>!value);setDraft(props.latex)}}>编辑公式</button>{props.locked&&<button type="button" className="ss-tool" onClick={()=>update({...props,locked:false,studentConfirmed:false})}>允许 AI 重新整理</button>}</div>
    {editing&&<div className="space-y-2"><label className="block text-[11px]">LaTeX 源码<textarea aria-label="编辑公式 LaTeX" value={draft} maxLength={2000} onChange={event=>setDraft(event.target.value)} className="block w-full rounded border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-2 font-mono text-[12px]" rows={2}/></label><button type="button" className="ss-tool" onClick={()=>void saveLatex()}>重新检查并保存</button></div>}
    {error&&<p role="alert" className="text-[11px] text-[color:var(--md-sys-color-error)]">{error}</p>}
  </section>
}
