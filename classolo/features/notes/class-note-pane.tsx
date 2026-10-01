'use client'

import {useEffect,useRef,useState} from 'react'
import {useUserNotes} from '@/lib/stores/userNotes'
import type {UserNote} from '@/lib/notes/userNote'
import {MarkdownStream} from '@/classolo/components/markdown'
import {resolveClassNoteProposal} from './class-note'

export function ClassNotePane({sessionId,noteId,ownerId,onOrganize}:{sessionId:string|null;noteId?:string;ownerId:string|null;onOrganize:()=>void}){
  const [undo,setUndo]=useState<{id:string;markdown:string;source:UserNote['source']}|null>(null)
  const [preview,setPreview]=useState(false)
  const hydrated=useUserNotes(state=>state._hasHydrated)
  const note=useUserNotes(state=>{
    const linked=noteId?state.byId[noteId]:undefined
    if(linked?.source?.ownerId===ownerId&&linked.source.sessionId===sessionId)return linked
    return state.order.map(id=>state.byId[id]).find(row=>row?.source?.kind==='class'&&row.source.sessionId===sessionId&&row.source.ownerId===ownerId)
  })
  if(!sessionId)return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[color:var(--ink-faint)]">开始录音或导入文稿后，可以在这里持续整理本课笔记。</div>
  if(!hydrated)return <p role="status" className="p-4 text-sm">正在恢复笔记库…</p>
  if(!note)return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"><p className="text-sm text-[color:var(--ink)]">本课还没有学习笔记</p><p className="max-w-sm text-xs text-[color:var(--ink-faint)]">整理会汇入提纲、公式、课堂资料、已作答题目与完整文稿。之后可在同一篇笔记里继续写。</p><button type="button" className="ss-tool" onClick={onOrganize}>创建本课笔记</button></div>
  function choose(choice:'accept'|'ignore'){
    if(!note)return
    const current=useUserNotes.getState().byId[note.id]??note,next=resolveClassNoteProposal(current,choice)
    if(!next)return
    setUndo({id:current.id,markdown:current.markdown,source:current.source})
    useUserNotes.getState().updateNote(current.id,next)
  }
  return <div className="flex h-full min-h-0 flex-col">{note.source?.proposalHash&&<div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line-soft)] bg-[color:var(--accent-weak)] px-3 py-2 text-[11px]"><span className="mr-auto">课堂整理有新建议，原有手写已保留。</span><button className="underline" onClick={()=>choose('accept')}>采纳更新</button><button className="underline" onClick={()=>choose('ignore')}>忽略更新</button></div>}{undo?.id===note.id&&<button type="button" className="self-end px-3 py-1 text-[11px] underline" onClick={()=>{useUserNotes.getState().updateNote(note.id,{markdown:undo.markdown,source:undo.source});setUndo(null)}}>撤销上次采纳或忽略</button>}<div className="min-h-0 flex-1"><ClassNoteEditor key={`${note.id}:${note.updatedAt}`} note={note} onOrganize={onOrganize} preview={preview} onPreviewChange={setPreview}/></div></div>
}

function ClassNoteEditor({note,onOrganize,preview,onPreviewChange}:{note:UserNote;onOrganize:()=>void;preview:boolean;onPreviewChange:(value:boolean)=>void}){
  const [draft,setDraft]=useState(note.markdown),[saved,setSaved]=useState(true)
  const draftRef=useRef(draft),savedRef=useRef(note.markdown)
  useEffect(()=>()=>{if(draftRef.current!==savedRef.current)useUserNotes.getState().updateNote(note.id,{markdown:draftRef.current})},[note.id])
  function save(){if(draft===savedRef.current)return;useUserNotes.getState().updateNote(note.id,{markdown:draft});savedRef.current=draft;setSaved(true)}
  return <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-panel)]">
    <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-2"><strong className="mr-auto truncate text-[13px]">{note.title}</strong><span role="status" className="text-[11px] text-[color:var(--ink-faint)]">{saved?'已保存':'有未保存编辑'}</span><button type="button" className="ss-tool" onClick={()=>{save();onPreviewChange(!preview)}}>{preview?'编辑':'预览'}</button><button type="button" className="ss-tool" onClick={save}>保存</button><button type="button" className="ss-tool" onClick={()=>{save();onOrganize()}}>更新课堂整理</button><button type="button" className="ss-tool" onClick={()=>{save();useUserNotes.getState().openEditor(note.id)}}>完整编辑器</button></div>
    {preview?<div className="min-h-0 flex-1 overflow-auto p-4"><MarkdownStream markdown={draft}/></div>:<textarea aria-label="本课笔记" value={draft} onChange={event=>{draftRef.current=event.target.value;setDraft(event.target.value);setSaved(false)}} onBlur={save} spellCheck={false} className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 text-[color:var(--ink)] outline-none"/>}
  </div>
}
