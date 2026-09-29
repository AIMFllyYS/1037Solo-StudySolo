'use client'

import { RenderErrorCard } from '../error-card'
import type { RenderMessage } from '../types'

import { parseGenUiDsl, type GenUiNode } from './dsl'

type Props = { dsl: unknown }

function renderNode(node: GenUiNode) {
  if (node.type === 'text') {
    return <p className="text-sm text-foreground">{node.text}</p>
  }
  if (node.type === 'kpi') {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">{node.label}</p>
        <p className="text-lg font-medium text-foreground">{node.value}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {node.children.map((child, index) => (
        <div key={`${child.type}-${index}`}>{renderNode(child)}</div>
      ))}
    </div>
  )
}

export function GenUiModule({
  props,
  message,
}: {
  props: Props
  message: RenderMessage<Props>
  onAnchorClick?: (segmentId: string) => void
}) {
  const parsed = parseGenUiDsl(props.dsl)
  if (!parsed.ok) {
    return <RenderErrorCard message={message} error={parsed.error} />
  }
  return <div data-slot="gen-ui">{renderNode(parsed.node)}</div>
}
