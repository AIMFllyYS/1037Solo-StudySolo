import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import type { RenderMessage } from '@/classolo/features/render-modules/types'

export interface RenderProjectionState {
  byId: Readonly<Record<string, RenderMessage>>
  order: readonly string[]
}

export const initialRenderProjection: RenderProjectionState = {
  byId: {},
  order: [],
}

export const renderProjectionStore = createStore(
  subscribeWithSelector<RenderProjectionState>(() => initialRenderProjection),
)

export function getRenderMessages(
  target: RenderMessage['target'],
): RenderMessage[] {
  const { byId, order } = renderProjectionStore.getState()
  return order
    .map((id) => byId[id])
    .filter((message): message is RenderMessage => message?.target === target)
}

export function subscribeRenderProjection<T>(
  selector: (state: RenderProjectionState) => T,
  listener: (selected: T, previous: T) => void,
): () => void {
  return renderProjectionStore.subscribe(selector, listener)
}

export function useRenderProjection<T>(
  selector: (state: RenderProjectionState) => T,
): T {
  return useStore(renderProjectionStore, selector)
}
