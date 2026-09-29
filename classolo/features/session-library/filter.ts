/**
 * 课堂会话列表的纯过滤/排序逻辑（issues #50/#63/#64）。
 * 与 UI 解耦，便于单测。
 */
import type { ClassSession } from '@/classolo/lib/db'

export interface SessionListFilter {
  query?: string
  includeArchived?: boolean
}

/**
 * 过滤 + 排序会话：
 *  - 默认隐藏已归档；includeArchived=true 时全部显示。
 *  - query 命中标题（大小写不敏感）。
 *  - 按 updatedAt 倒序（最近在前）。
 */
export function filterSessions(
  sessions: readonly ClassSession[],
  filter: SessionListFilter = {},
): ClassSession[] {
  const needle = (filter.query ?? '').trim().toLowerCase()
  return sessions
    .filter((s) => (filter.includeArchived ? true : !s.archived))
    .filter((s) =>
      needle ? (s.title ?? '').toLowerCase().includes(needle) : true,
    )
    .slice()
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

/** 会话状态 -> 中文短标签。 */
export function sessionStatusLabel(status: string): string {
  switch (status) {
    case 'recording':
      return '录音中'
    case 'paused':
      return '已暂停'
    case 'ended':
      return '已结束'
    default:
      return '草稿'
  }
}
