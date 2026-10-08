'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
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
  Settings2,
  X,
} from 'lucide-react'

import type { ClassSession } from '@/classolo/lib/db'
import ActionButton from '@/components/ui/ActionButton'
import { SearchField } from '@/components/ui/PageChrome'

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

/** 状态点：录音中是脉动的强调色，暂停是暖色，已结束是淡灰，草稿是空心圈。 */
function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'mt-[7px] h-2 w-2 shrink-0 self-start rounded-full',
        status === 'recording' && 'animate-pulse bg-[var(--md-sys-color-error)]',
        status === 'paused' && 'bg-[var(--md-sys-color-tertiary)]',
        status === 'ended' && 'bg-[var(--ink-faint)] opacity-60',
        status !== 'recording' && status !== 'paused' && status !== 'ended' && 'border border-[var(--ink-faint)]',
      )}
    />
  )
}

function formatUpdated(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const ICON_BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[color:var(--ink-soft)] outline-none transition-colors hover:bg-[color:var(--bg-muted)] hover:text-[color:var(--ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] disabled:opacity-40'

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

  // 宽度与收起 / 展开过渡由外层 ResizableRail 负责；这里只铺满它给的宽度。
  const rail = (inner: ReactNode) => (
    <div
      data-class-sidebar
      className={`ss-class-side-rail ${collapsed ? 'is-collapsed' : ''}`}
    >
      {inner}
    </div>
  )

  if (collapsed) {
    return rail(
      <div className="flex h-full w-11 flex-col items-center gap-2 py-3">
        <button type="button" aria-label="展开课堂列表" className={ICON_BUTTON} onClick={onToggle}>
          <ChevronRight className="size-4" />
        </button>
        {onFlipToNotes ? (
          <button type="button" aria-label="切换到笔记侧栏" title="切换到笔记侧栏" className={ICON_BUTTON} onClick={onFlipToNotes}>
            <ArrowLeftRight className="size-4" />
          </button>
        ) : null}
        <button type="button" aria-label="新建课堂" className={ICON_BUTTON} onClick={onNew} disabled={busy}>
          <Plus className="size-4" />
        </button>
      </div>
    )
  }

  return rail(
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[color:var(--line-soft)] pl-4 pr-2.5">
        <span className="mr-auto min-w-0 truncate text-[13px] font-semibold text-[color:var(--ink)]">
          课堂记录
        </span>
        {onFlipToNotes ? (
          <button type="button" aria-label="切换到笔记侧栏" title="切换到笔记侧栏" className={ICON_BUTTON} onClick={onFlipToNotes}>
            <ArrowLeftRight className="size-4" />
          </button>
        ) : null}
        <button type="button" aria-label="收起课堂列表" className={ICON_BUTTON} onClick={onToggle}>
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* issue #64：完整导航——新录音 / 导入 在上，资源库 / 复习 / 测试 / 设置 在下；
          每个入口都落到真实页面（Review 模式对应板块），没有假入口。 */}
      <div className="flex shrink-0 flex-col gap-2.5 px-3 pb-2 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="primary" icon={<Mic className="size-3.5" />} onClick={onNew} disabled={busy}>新录音</ActionButton>
          <ActionButton variant="secondary" icon={<FileInput className="size-3.5" />} onClick={onImport} disabled={busy || !onImport}>导入文稿</ActionButton>
        </div>
        <SearchField className="w-full" value={query} onChange={setQuery} placeholder="搜索课堂" ariaLabel="搜索课堂" />
      </div>

      <ul className="scroll-y min-h-0 flex-1 space-y-0.5 px-2 pb-2">
        {rows.length === 0 ? (
          <li className="px-2 py-8 text-center text-xs leading-relaxed text-[color:var(--ink-faint)]">
            {query ? '没有匹配的课堂' : '还没有课堂记录，点击「新录音」开始'}
          </li>
        ) : (
          rows.map((s) => {
            const active = s.id === currentId
            const editing = editingId === s.id
            const status = active && liveStatus && liveStatus !== 'idle' ? (liveStatus === 'stopped' ? 'ended' : liveStatus) : s.status
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
                      className="h-8 w-full rounded-lg border border-[color:var(--accent)] bg-[color:var(--bg-app)] px-2.5 text-[13px] text-[color:var(--ink)] outline-none"
                    />
                    <button type="submit" aria-label="确认重命名" className={clsx(ICON_BUTTON, 'text-[color:var(--accent)]')}>
                      <Check className="size-3.5" />
                    </button>
                    <button type="button" aria-label="取消" className={ICON_BUTTON} onClick={() => setEditingId(null)}>
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <div
                    className={clsx(
                      'group relative flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors duration-[var(--duration-fast)]',
                      active
                        ? 'bg-[color:var(--accent-weak)] text-[color:var(--accent-ink)]'
                        : 'text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]',
                    )}
                  >
                    <StatusDot status={status} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left outline-none focus-visible:underline"
                      onClick={() => onOpen(s.id)}
                      disabled={busy}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className={clsx('block truncate text-[13px] font-medium', !active && 'text-[color:var(--ink)]')}>
                        {s.title || '未命名课堂'}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] opacity-75">
                        <span>{sessionStatusLabel(status)}</span>
                        {formatUpdated(s.updatedAt) ? <><span aria-hidden>·</span><span className="tabular-nums">{formatUpdated(s.updatedAt)}</span></> : null}
                      </span>
                    </button>
                    <span className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg bg-inherit opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="重命名"
                        className={ICON_BUTTON}
                        onClick={() => {
                          setEditingId(s.id)
                          setDraft(s.title || '')
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" aria-label="归档" className={ICON_BUTTON} onClick={() => onArchive(s.id)}>
                        <Archive className="size-3.5" />
                      </button>
                    </span>
                  </div>
                )}
              </li>
            )
          })
        )}
      </ul>

      <nav aria-label="课堂之外" className="shrink-0 border-t border-[color:var(--line-soft)] px-2 py-1.5">
        <Link href="/review?section=notes" className="ss-nav-link"><NotebookText className="size-3.5" />资源库（笔记）</Link>
        <Link href="/review?section=flashcards" className="ss-nav-link"><Layers className="size-3.5" />复习站（闪卡）</Link>
        <Link href="/review?section=quiz" className="ss-nav-link"><ListChecks className="size-3.5" />测试站（出题）</Link>
        {onOpenSettings ? (
          <button type="button" onClick={onOpenSettings} className="ss-nav-link w-full"><Settings2 className="size-3.5" />课堂设置</button>
        ) : null}
      </nav>
      <div className="flex shrink-0 items-center gap-1.5 border-t border-[color:var(--line-soft)] px-4 py-2 text-[11px] text-[color:var(--ink-faint)]">
        <span aria-hidden className={clsx('size-1.5 rounded-full', pendingCount > 0 ? 'bg-[color:var(--md-sys-color-tertiary,var(--accent))]' : 'bg-[color:var(--accent)] opacity-60')} />
        {pendingCount > 0 ? `${pendingCount} 项待同步` : '课堂变更已同步'}
      </div>
    </div>
  )
}
