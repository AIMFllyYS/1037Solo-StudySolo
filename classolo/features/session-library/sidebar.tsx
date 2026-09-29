'use client'

import { useMemo, useState } from 'react'
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react'

import type { ClassSession } from '@/classolo/lib/db'

import { filterSessions, sessionStatusLabel } from './filter'

export interface SessionSidebarProps {
  sessions: readonly ClassSession[]
  currentId: string | null
  /** 当前课的实时录音状态：云端状态落库有延迟，当前行以它为准，停止后不再残留「录音中」。 */
  liveStatus?: 'idle' | 'recording' | 'paused' | 'stopped'
  collapsed: boolean
  pendingCount: number
  busy?: boolean
  onToggle: () => void
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onArchive: (id: string) => void
}

export function SessionSidebar({
  sessions,
  currentId,
  liveStatus,
  collapsed,
  pendingCount,
  busy,
  onToggle,
  onOpen,
  onNew,
  onRename,
  onArchive,
}: SessionSidebarProps) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const rows = useMemo(
    () => filterSessions(sessions, { query }),
    [sessions, query],
  )

  if (collapsed) {
    return (
      <div className="flex h-full w-11 flex-col items-center gap-2 border-r border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] py-3">
        <button
          type="button"
          aria-label="展开课堂列表"
          className="rounded-lg p-2 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]"
          onClick={onToggle}
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          aria-label="新建课堂"
          className="rounded-lg p-2 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]"
          onClick={onNew}
          disabled={busy}
        >
          <Plus className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-64 min-w-64 flex-col border-r border-[color:var(--line-soft)] bg-[color:var(--bg-panel)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="mr-auto text-[13px] font-medium text-[color:var(--ink)]">
          课堂记录
        </span>
        <button
          type="button"
          aria-label="新建课堂"
          className="rounded-lg p-1.5 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]"
          onClick={onNew}
          disabled={busy}
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="收起课堂列表"
          className="rounded-lg p-1.5 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]"
          onClick={onToggle}
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] px-2.5 py-1.5">
          <Search className="size-3.5 text-[color:var(--ink-faint)]" />
          <input
            aria-label="搜索课堂"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索课堂"
            className="w-full bg-transparent text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-2">
        {rows.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-[color:var(--ink-faint)]">
            {query ? '没有匹配的课堂' : '还没有课堂记录，点击 + 新建'}
          </li>
        ) : (
          rows.map((s) => {
            const active = s.id === currentId
            const editing = editingId === s.id
            return (
              <li key={s.id}>
                {editing ? (
                  <form
                    className="flex items-center gap-1 px-1 py-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const next = draft.trim()
                      if (next) onRename(s.id, next.slice(0, 60))
                      setEditingId(null)
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="重命名课堂"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full rounded-md border border-[color:var(--accent)] bg-[color:var(--bg-app)] px-2 py-1 text-[13px] text-[color:var(--ink)] outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="确认重命名"
                      className="rounded-md p-1 text-[color:var(--accent)] hover:bg-[color:var(--bg-muted)]"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="取消"
                      className="rounded-md p-1 text-[color:var(--ink-faint)] hover:bg-[color:var(--bg-muted)]"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <div
                    className={[
                      'group flex items-center gap-1 rounded-lg px-2 py-1.5',
                      active
                        ? 'bg-[color:var(--accent-weak)] text-[color:var(--accent-ink)]'
                        : 'text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onOpen(s.id)}
                      disabled={busy}
                    >
                      <span className="block truncate text-[13px] font-medium">
                        {s.title || '未命名课堂'}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[color:var(--ink-faint)]">
                        {sessionStatusLabel(active && liveStatus && liveStatus !== 'idle' ? (liveStatus === 'stopped' ? 'ended' : liveStatus) : s.status)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="重命名"
                      className="rounded-md p-1 text-[color:var(--ink-faint)] opacity-0 hover:bg-[color:var(--bg-app)] group-hover:opacity-100"
                      onClick={() => {
                        setEditingId(s.id)
                        setDraft(s.title || '')
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="归档"
                      className="rounded-md p-1 text-[color:var(--ink-faint)] opacity-0 hover:bg-[color:var(--bg-app)] group-hover:opacity-100"
                      onClick={() => onArchive(s.id)}
                    >
                      <Archive className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            )
          })
        )}
      </ul>
      <div className="border-t border-[color:var(--line-soft)] px-3 py-2 text-[11px] text-[color:var(--ink-faint)]">
        {pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500" />
            {pendingCount} 项待同步
          </span>
        ) : (
          '课堂变更已同步'
        )}
      </div>
    </div>
  )
}
