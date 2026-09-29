import { initialSettingsPublic, settingsPublicStore } from '../reads/settings'
import type { SettingsPublic } from '../types'

export function patchSettingsPublic(patch: Partial<SettingsPublic>): void {
  settingsPublicStore.setState(patch)
}

export function resetSettingsPublic(): void {
  settingsPublicStore.setState(initialSettingsPublic)
}
