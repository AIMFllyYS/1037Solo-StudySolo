'use client'

import { MarkdownStream } from '@/classolo/components/markdown'

import type { RenderMessage } from '../types'

export type RichTextModuleProps = {
  markdown: string
}

/**
 * 静默 Agent 会在正文里写「文稿事实 [2c9efcb5]」这类片段 id；卡片自带「回跳文稿」锚点，
 * 这些 id 对学生只是噪声。只去掉「方括号包裹的纯十六进制 id」，不动 `[链接](…)` 与普通方括号。
 */
export function stripSegmentIds(markdown: string): string {
  return markdown
    .replace(/\s?\[[0-9a-f]{8}(?:-[0-9a-f]{4}){0,3}(?:-[0-9a-f]{12})?\](?!\()/gi, '')
    // 去掉 id 后剩下的空出处标注，如「（文稿事实，）」「(文稿事实)」。
    .replace(/[（(]\s*文稿事实\s*[，,、]?\s*[)）]/g, '')
}

export function RichTextModule({
  props,
}: {
  props: RichTextModuleProps
  message: RenderMessage<RichTextModuleProps>
  onAnchorClick?: (segmentId: string) => void
}) {
  return <MarkdownStream markdown={stripSegmentIds(props.markdown)} />
}
