'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from '@/classolo/lib/theme/preference'

const CYCLE: ThemePreference[] = ['dark', 'light', 'system']
const ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}
const LABEL: Record<ThemePreference, string> = {
  light: '浅色模式',
  dark: '深色模式',
  system: '跟随系统',
}

export function ThemeToggle() {
  const theme: ThemePreference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    () => 'system',
  )
  const Icon = ICON[theme]

  return (
    <button
      type="button"
      onClick={() => {
        const index = CYCLE.indexOf(theme)
        const next = CYCLE[(index + 1) % CYCLE.length] ?? 'system'
        setThemePreference(next)
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground active:scale-95"
      title={LABEL[theme]}
      aria-label={`切换主题：${LABEL[theme]}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
