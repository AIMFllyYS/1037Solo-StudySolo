'use client'
import {memo,useMemo,useState} from 'react'
import {getDb,queueClassTranscriptCorrection} from '@/classolo/lib/db'
import {replaceCommitted} from '@/classolo/lib/session/writes/transcript'
import type {TranscriptCommittedSegment} from '@/classolo/lib/session/types'
import {requestOutlineRefresh} from '@/classolo/features/notes/organizer'
import {transcriptFlusher} from './flush-runtime'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {suggestTermCorrections,type CorrectionAction} from './term-correction'

export const TranscriptSegmentLine=memo(function TranscriptSegmentLine({segment,sessionId,terms,highlighted,onAddTerm}:{segment:TranscriptCommittedSegment;sessionId:string|null;terms:readonly string[];highlighted:boolean;onAddTerm?:(term:string)=>void}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(segment.text),[seenRevision,setSeenRevision]=useState(segment.correctionRevision??0),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [formulaOpen,setFormulaOpen]=useState(false),[spoken,setSpoken]=useState(''),[latex,setLatex]=useState('')
  const [newTerm,setNewTerm]=useState('')
  const revision=segment.correctionRevision??0
  if(revision!==seenRevision){setSeenRevision(revision);setDraft(segment.text)}
  const candidates=useMemo(()=>suggestTermCorrections(segment.id,segment.text,terms),[segment.id,segment.text,terms])
  async function change(action:CorrectionAction){
    if(!sessionId||busy)return
    setBusy(true);setError('')
    try{
      const {row,pending}=queueClassTranscriptCorrection(await getDb(),{sessionId,segmentId:segment.id,action})
      replaceCommitted({...segment,text:row.correctedText,rawText:segment.rawText??segment.text,correctionRevision:row.revision})
      setEditing(false);requestOutlineRefresh()
      await pending
    }catch(cause){setError(cause instanceof Error?cause.message:'更正失败，本机文稿未更改')}
    finally{setBusy(false)}
  }
  async function addFormula(){
    if(!sessionId||busy)return
    setBusy(true);setError('')
    try{
      await transcriptFlusher.flush(true)
      if(transcriptFlusher.pendingCount())throw new Error('原始文稿尚未保存，请稍后再试')
      const {validateFormulaProposal}=await import('@/classolo/features/formulas/validate')
      const checked=validateFormulaProposal({sourceSegmentId:segment.id,spokenText:spoken,latex},segment.text,revision)
      upsertRenderMessage({id:checked.id,module:'formula',version:'1.0',target:'transcript',props:{...checked,locked:true},meta:{createdAt:Date.now(),source:'system',transcriptAnchor:segment.id}})
      setFormulaOpen(false);setSpoken('');setLatex('')
    }catch(cause){setError(cause instanceof Error?cause.message:'无法添加公式')}
    finally{setBusy(false)}
  }
  return <div data-segment-id={segment.id} className={`rounded-md px-2 py-1 text-[color:var(--ink)] transition-colors ${highlighted?'bg-[color:var(--accent-weak)]':''}`}>
    <p className="whitespace-pre-wrap">{segment.text}</p>
    <div className="flex items-center gap-2 text-[11px] text-[color:var(--ink-faint)]">
      {revision>0&&<span>已校正 {revision} 次</span>}
      <button type="button" className="underline" aria-label={`更正第${segment.seq}段文稿`} onClick={()=>{setEditing(value=>!value);setDraft(segment.text)}}>更正文稿</button>
      <button type="button" className="underline" onClick={()=>setFormulaOpen(value=>!value)}>添加公式</button>
      {candidates.length>0&&!editing&&<span>有 {candidates.length} 个术语候选</span>}
    </div>
    {formulaOpen&&<div className="mt-2 space-y-2 rounded-lg border border-[color:var(--line-soft)] p-2 text-[12px]"><label className="block">原文口述片段<input aria-label="公式口述" value={spoken} onChange={event=>setSpoken(event.target.value)} maxLength={500} className="mt-1 w-full rounded border p-1" placeholder="从本段文稿中复制准确口述"/></label><label className="block">LaTeX 写法<input aria-label="公式LaTeX" value={latex} onChange={event=>setLatex(event.target.value)} maxLength={2000} className="mt-1 w-full rounded border p-1 font-mono" placeholder="例如 E=mc^2 或 \\ce{H2O}"/></label><button type="button" className="underline disabled:opacity-40" disabled={busy||!spoken.trim()||!latex.trim()} onClick={()=>void addFormula()}>检查并保存候选</button><p>排版与有限数值检查会分开显示；请再核对其课堂含义。</p></div>}
    {editing&&<div className="mt-2 space-y-2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-2 text-[12px]">
      <p>ASR 原文：<span className="whitespace-pre-wrap">{segment.rawText??segment.text}</span></p>
      {candidates.length>0&&<div className="space-y-1"><p>疑似专业词（仅供确认）</p>{candidates.map(candidate=><button key={candidate.id} type="button" disabled={busy} className="mr-2 rounded border border-[color:var(--line-soft)] px-2 py-1 disabled:opacity-40" onClick={()=>void change({kind:'term',candidateId:candidate.id})}>{candidate.heard} → {candidate.term}</button>)}</div>}
      <label className="block space-y-1">手动校正文稿<textarea aria-label={`手动校正第${segment.seq}段`} value={draft} onChange={event=>setDraft(event.target.value)} rows={3} className="w-full rounded border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-2"/></label>
      <div className="flex flex-wrap gap-3"><button type="button" className="underline disabled:opacity-40" disabled={busy||draft===segment.text} onClick={()=>void change({kind:'manual',text:draft})}>保存校正</button><button type="button" className="underline disabled:opacity-40" disabled={busy||revision===0} onClick={()=>void change({kind:'undo'})}>撤回上次</button><button type="button" className="underline disabled:opacity-40" disabled={busy||revision===0} onClick={()=>void change({kind:'reset'})}>还原原文</button></div>
      {onAddTerm&&<div className="flex flex-wrap items-center gap-2"><input aria-label="新增本课术语" value={newTerm} onChange={event=>setNewTerm(event.target.value)} maxLength={40} className="min-w-0 flex-1 rounded border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-1" placeholder="确认过的学科词语"/><button type="button" className="underline disabled:opacity-40" disabled={!newTerm.trim()} onClick={()=>{onAddTerm(newTerm.trim());setNewTerm('')}}>加入本课术语</button></div>}
      <p className="text-[11px] text-[color:var(--ink-faint)]">原始识别记录会保留；更正后关联的导图会重新整理并按课堂 AI 用量计费。</p>
    </div>}
    {error&&<p role="alert" className="text-[11px] text-[color:var(--md-sys-color-error)]">{error}</p>}
  </div>
})
