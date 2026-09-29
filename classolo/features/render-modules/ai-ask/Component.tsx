'use client'

import { useState } from 'react'

import { MarkdownStream } from '@/classolo/components/markdown'
import { useStore as useUiStore } from '@/lib/stores/ui'

import type { RenderMessage } from '../types'

type Props = {
  question: string
  choices?: string[]
}

/**
 * 随堂提问：题干和选项都可能带公式，统一走课堂 Markdown（含 KaTeX）。
 * 静默 Agent 的 schema 不带标准答案（避免模型编造判分），所以选中后交给课堂助手
 * 按文稿讲解对错——复用同一个 Agent，而不是在卡片里另起一套判题逻辑。
 */
export function AiAskModule({
  props,
}: {
  props: Props
  message: RenderMessage<Props>
  onAnchorClick?: (segmentId: string) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [asked, setAsked] = useState(false)
  const choices = props.choices ?? []

  function ask(index: number) {
    setAsked(true)
    const letter = String.fromCharCode(65 + index)
    const list = choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join('\n')
    // 交给右栏同一个 Agent（与 Studio 共用会话与工具），它会用 searchClassTranscript 对照文稿讲解。
    useUiStore
      .getState()
      .sendToChat(`随堂提问：${props.question}\n${list}\n\n我选 ${letter}。请结合本节课文稿判断对错，并简要讲解。`)
  }

  return (
    <div data-slot="ai-ask" className="text-sm">
      <p className="font-medium text-[color:var(--ink)]">随堂提问</p>
      <MarkdownStream markdown={props.question} className="mt-1 text-[color:var(--ink)]" />
      {choices.length > 0 ? (
        <div role="radiogroup" aria-label="选项" className="mt-2 flex flex-col gap-1.5">
          {choices.map((choice, index) => (
            <button
              key={`${index}-${choice}`}
              type="button"
              role="radio"
              aria-checked={picked === index}
              onClick={() => setPicked(index)}
              className={[
                'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                picked === index
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-weak)] text-[color:var(--ink)]'
                  : 'border-[color:var(--line-soft)] text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]',
              ].join(' ')}
            >
              <span className="mt-px font-mono text-[11px] text-[color:var(--ink-faint)]">
                {String.fromCharCode(65 + index)}
              </span>
              <MarkdownStream markdown={choice} className="min-w-0 flex-1 [&_p]:my-0" />
            </button>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              disabled={picked === null}
              onClick={() => picked !== null && ask(picked)}
              className="rounded-md bg-[color:var(--accent)] px-2.5 py-1 text-[12px] text-[color:var(--accent-ink)] disabled:opacity-40"
            >
              {asked ? '再问一次' : '提交并请助手讲解'}
            </button>
            {asked ? (
              <span className="text-[11px] text-[color:var(--ink-faint)]">讲解显示在右侧 Agent</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
