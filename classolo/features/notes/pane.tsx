'use client'

import { useEffect, useMemo } from 'react'
import { Network } from 'lucide-react'

import { ClassroomMindmap } from '@/classolo/components/mindmap'
import { useNotesPublic } from '@/classolo/lib/session'

import { publishOutlineJump } from './jump'
import { startOutlineOrganizer } from './organizer'

export function NotesPane() {
  useEffect(() => startOutlineOrganizer(), [])
  const digest = useNotesPublic((state) => state.outlineDigest)
  const tree = useMemo(
    () =>
      digest.map((node) => ({
        id: node.id,
        title: node.title,
        parentId: node.parentId ?? null,
      })),
    [digest],
  )

  if (tree.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center text-[13px] text-[color:var(--ink-faint)]">
        <Network className="size-6 opacity-50" aria-hidden />
        <p>思维导图会随课堂文稿自动生成</p>
        <p className="text-xs">开始录音或导入文稿后，这里会出现层级大纲</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)]">
      <ClassroomMindmap nodes={tree} onNodeClick={publishOutlineJump} />
    </div>
  )
}
