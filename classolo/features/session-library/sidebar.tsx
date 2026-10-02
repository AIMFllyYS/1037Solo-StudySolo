'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileInput,
  Layers,
  ListChecks,
  Mic,
  NotebookText,
  Pencil,
  Plus,
  Search,
  Settings2,
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
  /** 导入已有文稿（与新录音分开：+ 是开一节新课，不是导入）。 */
  onImport?: () => void
  onOpenSettings?: () => void
  onFlipToNotes?: () => void
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
  onImport,
  onOpenSettings,
  onFlipToNotes,
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

  // 收起 / 展开共用同一个外层 .ss-rail：宽度用 Studio 左右栏同一条横向缓动过渡，内层固定宽度避免挤压换行。
  const rail = (inner: ReactNode) => (
    <div
      data-class-sidebar
      className={`ss-class-side-rail h-full ${collapsed ? 'is-collapsed' : ''}`}
    >
      {inner}
    </div>
  )

  if (collapsed) {
    return rail(
      <div className="flex h-full w-11 flex-col items-center gap-2 py-3">
        <button
          type="button"
          aria-label="展开课堂列表"
          className="rounded-lg p-2 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]"
          onClick={onToggle}
        >
          <ChevronRight className="size-4" />
        </button>
        {onFlipToNotes?<button type="button" aria-label="切换到笔记侧栏" title="切换到笔记侧栏" onClick={onFlipToNotes}><ArrowLeftRight className="size-4"/></button>:null}
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

  return rail(
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="mr-auto text-[13px] font-medium text-[color:var(--ink)]">
          课堂记录
        </span>
        {onFlipToNotes?<button type="button" aria-label="切换到笔记侧栏" title="切换到笔记侧栏" className="rounded-lg p-1.5 text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]" onClick={onFlipToNotes}><ArrowLeftRight className="size-4"/></button>:null}
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
      {/* issue #64：完整导航——新录音 / 导入 在上，资源库 / 复习 / 测试 / 设置 在下；
          每个入口都落到真实页面（Review 模式对应板块），没有假入口。 */}
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
        <button type="button" onClick={onNew} disabled={busy} className="ss-nav-cta">
          <Mic className="size-3.5" />新录音
        </button>
        <button type="button" onClick={onImport} disabled={busy || !onImport} className="ss-nav-cta ss-nav-cta--ghost">
          <FileInput className="size-3.5" />导入文稿
        </button>
      </div>      <div className="px-3 pb-2">
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
                      'group flex items-center gap-1 rounded-lg border px-2 py-1.5',
                      active
                        ? 'border-[color:var(--accent)] bg-[color:var(--bg-panel)] text-[color:var(--ink)]'
                        : 'border-transparent text-[color:var(--ink-soft)] hover:border-[color:var(--line-soft)] hover:bg-[color:var(--bg-muted)]',
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
      <nav aria-label="课堂之外" className="border-t border-[color:var(--line-soft)] px-2 py-1.5">
        <Link href="/review?section=notes" className="ss-nav-link"><NotebookText className="size-3.5" />资源库（笔记）</Link>
        <Link href="/review?section=flashcards" className="ss-nav-link"><Layers className="size-3.5" />复习站（闪卡）</Link>
        <Link href="/review?section=quiz" className="ss-nav-link"><ListChecks className="size-3.5" />测试站（出题）</Link>
        {onOpenSettings ? (
          <button type="button" onClick={onOpenSettings} className="ss-nav-link w-full"><Settings2 className="size-3.5" />课堂设置</button>
        ) : null}
      </nav>      <div className="border-t border-[color:var(--line-soft)] px-3 py-2 text-[11px] text-[color:var(--ink-faint)]">
        {pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[color:var(--md-sys-color-tertiary,var(--accent))]" />
            {pendingCount} 项待同步
          </span>
        ) : (
          '课堂变更已同步'
        )}
      </div>
    </div>
  )
}
