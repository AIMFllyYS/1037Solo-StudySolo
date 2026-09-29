'use client'

import type { RenderMessage } from '../types'

type Props = {
  status: string
  detail?: string
}

export function AgentStatusModule({
  props,
}: {
  props: Props
  message: RenderMessage<Props>
  onAnchorClick?: (segmentId: string) => void
}) {
  return (
    <div data-slot="agent-status" className="text-sm">
      <p className="font-medium text-foreground">静默 Agent：{props.status}</p>
      {props.detail ? (
        <p className="mt-1 text-muted-foreground">{props.detail}</p>
      ) : null}
    </div>
  )
}
