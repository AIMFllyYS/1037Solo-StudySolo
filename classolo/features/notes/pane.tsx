'use client'

import { useMemo,useState } from 'react'
import { Network } from 'lucide-react'

import { ClassroomMindmap } from '@/classolo/components/mindmap'
import {getClassUserId} from '@/classolo/lib/db'
import { getNotesPublic,useNotesPublic,useTranscriptPublic } from '@/classolo/lib/session'
import {patchNotesPublic} from '@/classolo/lib/session/writes/notes'

import { publishOutlineJump } from './jump'
import {requestOutlineRefresh } from './organizer'
import {outlineProgressStats} from './incremental'

export function NotesPane() {
  const digest = useNotesPublic((state) => state.outlineDigest)
  const status=useNotesPublic(state=>state.organizerStatus),error=useNotesPublic(state=>state.organizerError)
  const progress=useNotesPublic(state=>state.processedSegments),segments=useTranscriptPublic(state=>state.committed)
  const sessionId=useTranscriptPublic(state=>state.sessionId)
  const coverage=useMemo(()=>outlineProgressStats(segments,progress),[segments,progress])
  const [selectedId,setSelectedId]=useState<string|null>(null),[title,setTitle]=useState(''),[anchorMissing,setAnchorMissing]=useState(false)
  const selected=digest.find(node=>node.id===selectedId)
  const tree = useMemo(
    () =>
      digest.map((node) => ({
        id: node.id,
        title: node.title,
        parentId: node.parentId ?? null,
      })),
    [digest],
  )

  function pick(id:string){const node=digest.find(node=>node.id===id);setSelectedId(id);setTitle(node?.title||'');setAnchorMissing(!publishOutlineJump(id))}
  function saveTitle(){if(!selected||!title.trim())return;patchNotesPublic({outlineDigest:getNotesPublic().outlineDigest.map(node=>node.id===selected.id?{...node,title:title.trim().slice(0,500),origin:'manual',locked:true}:node)})}
  const toolbar=<div className="flex flex-wrap items-center gap-2 pb-2 text-[11px] text-[color:var(--ink-faint)]"><span className="mr-auto" role="status">{status==='thinking'?'正在整理新增文稿…':status==='queued'?'等待整理新增文稿':status==='error'?'整理未完成':status==='fallback'?'当前为文稿摘要，AI暂不可用':'主题随文稿累积'} · {coverage.completed}/{coverage.total} 段</span><button type="button" className="ss-tool" onClick={()=>requestOutlineRefresh()}>继续整理</button><button type="button" className="ss-tool" onClick={()=>requestOutlineRefresh(true)}>重新对照全文</button></div>
  if (tree.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 text-center text-[13px] text-[color:var(--ink-faint)]">{toolbar}<div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Network className="size-6 opacity-50" aria-hidden />
        <p>思维导图会随课堂文稿自动生成</p>
        <p className="text-xs">开始录音或导入文稿后，这里会出现层级大纲</p>
      {error&&<p role="alert">{error}</p>}</div></div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">{toolbar}{error&&<p role="alert" className="mb-2 text-[12px]">{error}</p>}
      {selected&&<div className="mb-2 rounded-lg border border-[color:var(--line-soft)] p-2 text-[12px]"><div className="flex gap-2"><input aria-label="导图节点标题" value={title} onChange={event=>setTitle(event.target.value)} className="min-w-0 flex-1 rounded bg-[color:var(--bg-app)] px-2 py-1"/><button type="button" onClick={saveTitle} className="ss-tool">保存并固定</button>{selected.locked&&<button type="button" className="ss-tool" onClick={()=>patchNotesPublic({outlineDigest:getNotesPublic().outlineDigest.map(node=>node.id===selected.id?{...node,locked:false,origin:'ai'}:node)})}>允许 AI 整理</button>}</div>{anchorMissing&&<p className="mt-1 text-[color:var(--ink-faint)]">该节点没有已保存的文稿来源，可重新对照全文补充。</p>}</div>}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)]"><ClassroomMindmap nodes={tree} layoutKey={sessionId&&getClassUserId()?`${getClassUserId()}:${sessionId}`:null} onNodeClick={pick} /></div>
    </div>
  )
}
