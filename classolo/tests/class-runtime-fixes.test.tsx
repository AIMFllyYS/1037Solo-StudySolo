import { describe, expect, it } from 'vitest'

import { classAiBaseUrl } from '@/classolo/lib/ai/create-model'
import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
import { stripSegmentIds } from '@/classolo/features/render-modules/rich-text/Component'
import { layoutOutlineTree } from '@/classolo/components/mindmap/layout'
import { rankTranscriptSegments } from '@/lib/class/transcriptSearch'

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
  const seg = (id: string, seq: number, text: string) => ({ id, seq, text })
  const committed = [
    seg('a', 1, '导数描述函数在某一点的瞬时变化率。'),
    seg('b', 2, '可导一定连续，但连续不一定可导，典型反例是 y=|x| 在 x=0 处。'),
    seg('c', 3, '复合函数求导要由外向内逐层求导。'),
  ]

  it('matches multi-term and conjunction queries the model actually sends', () => {
    expect(rankTranscriptSegments('可导 连续', committed)[0]?.segmentId).toBe('b')
    expect(rankTranscriptSegments('可导与连续', committed)[0]?.segmentId).toBe('b')
    expect(rankTranscriptSegments('连续不一定可导 |x|', committed)[0]?.segmentId).toBe('b')
  })

  it('returns nothing for unrelated queries', () => {
    expect(rankTranscriptSegments('细胞膜', committed)).toHaveLength(0)
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


describe('ASR hotword context', () => {
  it('builds a bounded, de-duplicated prompt and omits it when empty', async () => {
    const { buildHotwordPrompt, HOTWORD_PROMPT_MAX } = await import('@/classolo/lib/providers/asr/transcriptions-rest/openai-compatible')
    expect(buildHotwordPrompt([])).toBeUndefined()
    expect(buildHotwordPrompt(undefined)).toBeUndefined()
    expect(buildHotwordPrompt(['定积分', ' 定积分 ', '牛顿-莱布尼茨'])).toBe('本节课可能出现的专有名词：定积分、牛顿-莱布尼茨')
    const long = buildHotwordPrompt(Array.from({ length: 400 }, (_, i) => `术语${i}`))!
    expect(long.length).toBeLessThanOrEqual(HOTWORD_PROMPT_MAX)
  })
})
