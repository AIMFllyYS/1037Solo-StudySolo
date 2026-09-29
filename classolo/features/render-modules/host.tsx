'use client'

import { getRenderMessages, useRenderProjection } from '@/classolo/lib/session'

import { resolveRenderView } from './dispatch'
import { RenderErrorCard } from './error-card'
import { renderModuleRegistry } from './registry'
import type { RenderMessage } from './types'

export function RenderHost({
  target,
  onAnchorClick,
}: {
  target: RenderMessage['target']
  onAnchorClick?: (segmentId: string) => void
}) {
  const projection=useRenderProjection(state=>state.byId)
  const messages = getRenderMessages(target)
  void projection

  if (messages.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--ink-faint)]">
        {target === 'transcript'
          ? '课堂补充会显示在这里（配图 / 讲解 / 随堂题）'
          : '笔记补充会显示在这里（要点 / 解析）'}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {messages.map((message) => (
        <li key={message.id}>
          <RenderMessageView
            message={message}
            onAnchorClick={onAnchorClick}
          />
        </li>
      ))}
    </ul>
  )
}

function RenderMessageView({
  message,
  onAnchorClick,
}: {
  message: RenderMessage
  onAnchorClick?: (segmentId: string) => void
}) {
  const resolved = resolveRenderView(message, renderModuleRegistry)
  if (!resolved.ok) {
    return <RenderErrorCard message={message} error={resolved.error} />
  }
  const mod = renderModuleRegistry[message.module]
  if (!mod) {
    return <RenderErrorCard message={message} error="模块在分发后消失" />
  }
  const Module = mod.Component
  const anchor = message.meta.transcriptAnchor
  return (
    <div
      className="rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-2.5 text-[13px] text-[color:var(--ink)]"
      data-slot="render-message"
      data-module={message.module}
    >
      <Module
        props={resolved.props}
        message={message}
        onAnchorClick={onAnchorClick}
      />
      {anchor ? (
        <button
          type="button"
          className="mt-2 text-[11px] text-[color:var(--accent)] hover:underline"
          onClick={() => onAnchorClick?.(anchor)}
        >
          回跳文稿
        </button>
      ) : null}
    </div>
  )
}
