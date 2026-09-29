import {
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './boot-script'

export { THEME_STORAGE_KEY, type ThemePreference }

export interface ThemeTestHarness {
  storage: Map<string, string>
  prefersDark: boolean
  classes: string[]
}

let harness: ThemeTestHarness | null = null
let systemMedia: MediaQueryList | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function installThemeTestHarness(next: ThemeTestHarness): void {
  unbindSystemListener()
  harness = next
}

export function resetThemeTestHarness(): void {
  unbindSystemListener()
  harness = null
}

export function parseThemePreference(raw: string | null): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'light'
}

export function resolveHtmlTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

function readStored(): ThemePreference {
  if (harness) {
    return parseThemePreference(harness.storage.get(THEME_STORAGE_KEY) ?? null)
  }
  if (typeof localStorage === 'undefined') return 'light'
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

function writeStored(preference: ThemePreference): void {
  if (harness) {
    harness.storage.set(THEME_STORAGE_KEY, preference)
    return
  }
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // private-mode / quota: skip persist, still apply in-session
  }
}

function prefersDarkFromSystem(): boolean {
  if (harness) return harness.prefersDark
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyHtmlTheme(theme: 'light' | 'dark'): void {
  if (harness) {
    harness.classes.length = 0
    harness.classes.push(theme)
    return
  }
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(theme)
}

function unbindSystemListener(): void {
  if (!systemMedia) return
  systemMedia.removeEventListener('change', onSystemSchemeChange)
  systemMedia = null
}

function onSystemSchemeChange(): void {
  if (getThemePreference() !== 'system') return
  applyHtmlTheme(resolveHtmlTheme('system', prefersDarkFromSystem()))
}

function bindSystemListener(preference: ThemePreference): void {
  unbindSystemListener()
  if (preference !== 'system' || harness) return
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  systemMedia = window.matchMedia('(prefers-color-scheme: dark)')
  systemMedia.addEventListener('change', onSystemSchemeChange)
}

export function getThemePreference(): ThemePreference {
  return readStored()
}

export function applyThemePreference(
  preference: ThemePreference = getThemePreference(),
): void {
  applyHtmlTheme(resolveHtmlTheme(preference, prefersDarkFromSystem()))
  bindSystemListener(preference)
}

export function setThemePreference(preference: ThemePreference): void {
  writeStored(preference)
  applyThemePreference(preference)
  emit()
}
