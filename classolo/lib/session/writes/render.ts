import type { RenderMessage } from '@/classolo/features/render-modules/types'

import {
  initialRenderProjection,
  renderProjectionStore,
} from '../reads/render'

export function upsertRenderMessage(message: RenderMessage): void {
  renderProjectionStore.setState((state) => {
    const exists = state.byId[message.id] !== undefined
    return {
      byId: { ...state.byId, [message.id]: message },
      order: exists ? state.order : [...state.order, message.id],
    }
  })
}

export function revokeRenderMessage(id: string): void {
  renderProjectionStore.setState((state) => {
    if (state.byId[id] === undefined) {
      return state
    }
    const byId = { ...state.byId }
    delete byId[id]
    return {
      byId,
      order: state.order.filter((item) => item !== id),
    }
  })
}

export function resetRenderProjection(): void {
  renderProjectionStore.setState(initialRenderProjection)
}
