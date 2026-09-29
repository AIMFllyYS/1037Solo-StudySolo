import { z } from 'zod'

import { tool } from '@/classolo/lib/ai'
import { getClassUserId } from '@/classolo/lib/db'
import { getTranscriptPublic } from '@/classolo/lib/session'
import type { TranscriptCommittedSegment } from '@/classolo/lib/session'

import { searchTranscriptSnapshot } from './search-transcript'

/**
 * issue #70：课堂助手能引用「历史课」，而不只是当前这节。
 *
 * 只走已鉴权的 /api/class/state（owner + RLS），不引入第二个 Agent 框架：
 * 同一个课堂助手多一个工具，复用同一套文稿打分。每节课文稿按 owner 缓存在内存里，
 * 账号切换即失效，避免把上一个账号的课带给下一个人。
 */
export interface PastClassHit {
  sessionId: string
  sessionTitle: string
  segmentId: string
  text: string
  href: string
}

const MAX_SESSIONS = 12
const MAX_HITS = 8
type Loaded = { owner: string; title: string; segments: TranscriptCommittedSegment[] }
const cache = new Map<string, Loaded>()

async function classState<T>(op: string, input: Record<string, unknown>, owner: string): Promise<T> {
  const res = await fetch('/api/class/state', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, input, expectedUserId: owner }),
  })
  if (!res.ok) throw new Error(`class ${op} ${res.status}`)
  return (await res.json()) as T
}

export function rankPastClassHits(
  query: string,
  sessions: readonly { id: string; title: string; segments: readonly TranscriptCommittedSegment[] }[],
  limit = MAX_HITS,
): PastClassHit[] {
  const hits: (PastClassHit & { rank: number })[] = []
  for (const s of sessions) {
    searchTranscriptSnapshot(query, s.segments).forEach((hit, index) => {
      hits.push({
        sessionId: s.id,
        sessionTitle: s.title,
        segmentId: hit.segmentId,
        text: hit.text,
        href: `/class?session=${s.id}`,
        rank: index,
      })
    })
  }
  // 每节课的第一名优先，再按课内名次：保证结果覆盖多节课，而不是被一节课刷屏。
  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ rank: _rank, ...hit }) => {
      void _rank
      return hit
    })
}

export async function searchPastClasses(query: string): Promise<PastClassHit[] | { error: string }> {
  const owner = getClassUserId()
  if (!owner) return { error: '未登录，无法检索历史课堂' }
  for (const [key, value] of cache) if (value.owner !== owner) cache.delete(key)
  const current = getTranscriptPublic().sessionId
  const list = await classState<{ id: string; title?: string }[]>('session.list', {}, owner)
  const targets = (Array.isArray(list) ? list : []).filter((s) => s.id !== current).slice(0, MAX_SESSIONS)
  const loaded = await Promise.all(
    targets.map(async (s) => {
      const hit = cache.get(s.id)
      if (hit) return { id: s.id, ...hit }
      const data = await classState<{ transcript?: TranscriptCommittedSegment[] }>('session.load', { id: s.id }, owner).catch(() => null)
      if (!data || getClassUserId() !== owner) return null
      const entry: Loaded = { owner, title: s.title || '课堂', segments: data.transcript ?? [] }
      cache.set(s.id, entry)
      return { id: s.id, ...entry }
    }),
  )
  return rankPastClassHits(query, loaded.filter((x): x is NonNullable<typeof x> => !!x))
}

export const searchPastClassesTool = tool({
  description:
    '检索我以前上过的其他课堂（不含当前这节）的文稿。学生问到“以前/上节课/之前讲过的…”或需要跨课复习时使用。返回课名、片段与回看链接。',
  inputSchema: z.object({
    query: z.string().describe('关键词，可多个，用空格分隔'),
  }),
  execute: async ({ query }: { query: string }) => searchPastClasses(query),
})
