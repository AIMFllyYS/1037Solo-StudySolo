import { createStore } from 'zustand/vanilla'

export interface AsrPrivateConfig {
  family: string
  dialect: string
  baseUrl: string
  model: string
  sampleRate: string
  /** Memory-only user override. Never copy into SettingsPublic. */
  apiKey: string
}

export const initialAsrPrivate: AsrPrivateConfig = {
  family: '',
  dialect: '',
  baseUrl: '',
  model: '',
  sampleRate: '16000',
  apiKey: '',
}

export const asrPrivateStore = createStore<AsrPrivateConfig>(
  () => initialAsrPrivate,
)

export function getAsrPrivateConfig(): AsrPrivateConfig {
  return asrPrivateStore.getState()
}

export function patchAsrPrivate(patch: Partial<AsrPrivateConfig>): void {
  asrPrivateStore.setState(patch)
}

export function resetAsrPrivate(): void {
  asrPrivateStore.setState(initialAsrPrivate)
}
