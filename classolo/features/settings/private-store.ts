import { createStore } from 'zustand/vanilla'

export interface AiPrivateConfig {
  baseUrl: string
  model: string
  /** Memory-only user override. Never copy into SettingsPublic. */
  apiKey: string
}

export const initialAiPrivate: AiPrivateConfig = {
  baseUrl: '',
  model: '',
  apiKey: '',
}

export const aiPrivateStore = createStore<AiPrivateConfig>(
  () => initialAiPrivate,
)

export function getAiPrivateConfig(): AiPrivateConfig {
  return aiPrivateStore.getState()
}

export function patchAiPrivate(patch: Partial<AiPrivateConfig>): void {
  aiPrivateStore.setState(patch)
}

export function resetAiPrivate(): void {
  aiPrivateStore.setState(initialAiPrivate)
}
