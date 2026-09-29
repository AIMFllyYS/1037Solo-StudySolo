import { describe, expect, it } from 'vitest'

import { classAiBaseUrl } from '@/classolo/lib/ai/create-model'
import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
import { stripSegmentIds } from '@/classolo/features/render-modules/rich-text/Component'
import { numberCitations } from '@/classolo/features/agent/chat-panel'
import { layoutOutlineTree } from '@/classolo/components/mindmap/layout'

describe('classroom AI transport', () => {
  it('uses an absolute same-origin base URL (AI SDK rejects relative URLs)', () => {
    const base = classAiBaseUrl('http://localhost:35349/')
    expect(base).toBe('http://localhost:35349/api/class/ai')
    expect(() => new URL(`${base}/chat/completions`)).not.toThrow()
  })

  it('leaves room for reasoning tokens within the server cap', () => {
    expect(CLASS_OUTPUT_TOKENS).toBeGreaterThanOrEqual(2048)
    expect(CLASS_OUTPUT_TOKENS).toBeLessThanOrEqual(4096)
  })
})

describe('citation presentation', () => {
  const id = '18ac0c6f-8760-4b1b-9176-52499d20907f'

  it('numbers raw segment ids in chat answers', () => {
    expect(numberCitations(`可导一定连续 [${id}]。`, [id])).toBe('可导一定连续 〔1〕。')
  })

  it('keeps unrelated brackets and links in chat answers', () => {
    expect(numberCitations('见 [讲义](https://example.com) [x]', [id])).toBe('见 [讲义](https://example.com) [x]')
  })

  it('strips short and full ids plus empty source labels from supplements', () => {
    const md = '1. 定义（文稿事实 [2c9efcb5]） 与 [链接](https://a.b) 以及 [18ac0c6f-8760-4b1b-9176-52499d20907f]'
    expect(stripSegmentIds(md)).toBe('1. 定义 与 [链接](https://a.b) 以及')
  })
})

describe('mindmap layout', () => {
  it('stacks sibling topics vertically (left-to-right tree)', () => {
    const nodes = [
      { id: 'root', title: '导数' },
      { id: 'a', title: '定义', parentId: 'root' },
      { id: 'b', title: '几何意义', parentId: 'root' },
    ]
    const graph = layoutOutlineTree(nodes)
    const pos = Object.fromEntries(graph.nodes.map((n) => [n.id, n.position]))
    expect(pos.a.x).toBeGreaterThan(pos.root.x)
    expect(pos.a.x).toBe(pos.b.x)
    expect(pos.a.y).not.toBe(pos.b.y)
  })
})


describe('transcript search', () => {
  const seg = (id: string, seq: number, text: string) => ({ id, seq, text, startMs: 0, endMs: 0 }) as never
  const committed = [
    seg('a', 1, '导数描述函数在某一点的瞬时变化率。'),
    seg('b', 2, '可导一定连续，但连续不一定可导，典型反例是 y=|x| 在 x=0 处。'),
    seg('c', 3, '复合函数求导要由外向内逐层求导。'),
  ]

  it('matches multi-term and conjunction queries the model actually sends', async () => {
    const { searchTranscriptSnapshot } = await import('@/classolo/features/agent/search-transcript')
    expect(searchTranscriptSnapshot('可导 连续', committed)[0]?.segmentId).toBe('b')
    expect(searchTranscriptSnapshot('可导与连续', committed)[0]?.segmentId).toBe('b')
    expect(searchTranscriptSnapshot('连续不一定可导 |x|', committed)[0]?.segmentId).toBe('b')
  })

  it('returns nothing for unrelated queries', async () => {
    const { searchTranscriptSnapshot } = await import('@/classolo/features/agent/search-transcript')
    expect(searchTranscriptSnapshot('细胞膜', committed)).toHaveLength(0)
  })
})

describe('classroom transport retry policy', () => {
  it('retries only statuses where the server released the credit hold', async () => {
    const { isRetryableClassResponse } = await import('@/classolo/lib/ai/create-model')
    const r = (status: number, headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers) })
    expect(isRetryableClassResponse(r(429))).toBe(true)
    expect(isRetryableClassResponse(r(503, { 'retry-after': '3' }))).toBe(true)
    // 无 Retry-After 的 503 = 结果未知、额度保留待核对：不能重试，否则可能重复计费。
    expect(isRetryableClassResponse(r(503))).toBe(false)
    expect(isRetryableClassResponse(r(502))).toBe(false)
    expect(isRetryableClassResponse(r(200))).toBe(false)
  })

  it('honours Retry-After and caps the backoff', async () => {
    const { retryDelayMs } = await import('@/classolo/lib/ai/create-model')
    const d = retryDelayMs({ status: 429, headers: new Headers({ 'retry-after': '2' }) }, 0)
    expect(d).toBeGreaterThanOrEqual(2000)
    expect(d).toBeLessThan(2500)
    expect(retryDelayMs({ status: 429, headers: new Headers({ 'retry-after': '60' }) }, 0)).toBeLessThanOrEqual(8400)
  })
})
