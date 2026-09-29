import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import type { SettingsPublic } from '../types'

export const initialSettingsPublic: SettingsPublic = {
  asrConfigVersion: 0,
  aiConfigVersion: 0,
  hotwordsVersion: 0,
  asrReady: false,
  aiReady: false,
}

export const settingsPublicStore = createStore(
  subscribeWithSelector<SettingsPublic>(() => initialSettingsPublic),
)

export function getSettingsPublic(): SettingsPublic {
  return settingsPublicStore.getState()
}

export function subscribeSettingsPublic<T>(
  selector: (state: SettingsPublic) => T,
  listener: (selected: T, previous: T) => void,
): () => void {
  return settingsPublicStore.subscribe(selector, listener)
}

export function useSettingsPublic<T>(
  selector: (state: SettingsPublic) => T,
): T {
  return useStore(settingsPublicStore, selector)
}
