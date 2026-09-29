'use client'

import type { RenderMessage } from './types'

export function RenderErrorCard({
  message,
  error,
}: {
  message: RenderMessage
  error: string
}) {
  return (
    <div
      className="rounded-md border border-destructive/40 bg-card p-3 text-sm text-card-foreground"
      data-slot="render-error"
      data-module={message.module}
    >
      <p className="font-medium text-destructive">渲染失败</p>
      <p className="mt-1 text-muted-foreground">{error}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message.id}</p>
    </div>
  )
}
