import { z } from 'zod'

import { tool } from '@/classolo/lib/ai'
import { getTranscriptPublic } from '@/classolo/lib/session'
import type { TranscriptCommittedSegment } from '@/classolo/lib/session'

export interface TranscriptHit {
  segmentId: string
  seq: number
  text: string
}

const MAX_HITS = 6

function bigrams(text: string): Set<string> {
  const chars = [...text.replace(/\s+/g, '')]
  const grams = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) grams.add(chars[i] + chars[i + 1])
  return grams
}

/**
 * 模型给出的查询往往是「可导 连续」「可导与连续」「连续不一定可导 |x|」这种组合词，
 * 原先的整串 `includes` 在中文里几乎总是 0 命中，于是 Agent 只能说「检索没返回片段，无法标注」。
 * 这里按词项 + 中文二元组打分：整词命中权重高，二元组重叠作为兜底，返回得分最高的若干段。
 */
export function searchTranscriptSnapshot(
  query: string,
  committed: readonly TranscriptCommittedSegment[] = getTranscriptPublic()
    .committed,
): readonly TranscriptHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const terms = needle
    .split(/[\s,，。、;；:：|/\\()（）「」“”"'!?！？与和及或]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (terms.length === 0) terms.push(needle)
  const queryGrams = bigrams(terms.join(''))
  const scored = committed
    .map((segment) => {
      const text = segment.text.toLowerCase()
      let score = text.includes(needle) ? needle.length * 4 : 0
      for (const term of terms) if (text.includes(term)) score += term.length * 2
      if (queryGrams.size > 0) {
        const grams = bigrams(text)
        let overlap = 0
        for (const g of queryGrams) if (grams.has(g)) overlap += 1
        // 至少一半二元组重叠才算相关，避免「的是」这类高频字把无关段落拉进来。
        if (overlap / queryGrams.size >= 0.5) score += overlap
      }
      return { segment, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.segment.seq - b.segment.seq)
    .slice(0, MAX_HITS)
  return scored.map(({ segment }) => ({
    segmentId: segment.id,
    seq: segment.seq,
    text: segment.text,
  }))
}

export const searchTranscriptTool = tool({
  description:
    '检索本节课已确认文稿。必须用这个工具回答“刚才老师说了什么”，不要靠模型记忆。可传多个关键词（空格分隔）。',
  inputSchema: z.object({
    query: z.string().describe('关键词，可多个，用空格分隔，如“可导 连续”'),
  }),
  execute: async ({ query }: { query: string }) =>
    searchTranscriptSnapshot(query),
})
