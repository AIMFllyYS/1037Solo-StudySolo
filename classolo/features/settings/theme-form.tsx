'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/classolo/components/ui/card'
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/classolo/lib/theme/preference'
import { cn } from '@/classolo/lib/utils'

const OPTIONS: readonly {
  value: ThemePreference
  label: string
  icon: typeof Sun
}[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

export function ThemeSettingsForm() {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    () => 'system',
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>主题</CardTitle>
        <CardDescription>
          写入约定键 {THEME_STORAGE_KEY}（ADR-0014）。缺省跟随系统；强制浅色/深色后刷新由启动脚本读取同一键。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3" role="group" aria-label="主题">
          {OPTIONS.map((option) => {
            const selected = preference === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                data-slot="theme-preference"
                data-theme={option.value}
                onClick={() => setThemePreference(option.value)}
                className={cn(
                  'node-paper-bg flex flex-1 flex-col items-center gap-2 rounded-lg border-[1.5px] px-3 py-4 shadow-sm transition-all duration-200',
                  selected
                    ? 'scale-[1.02] border-primary/40 text-primary ring-2 ring-primary/10'
                    : 'border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('h-6 w-6', selected ? 'text-primary' : '')}
                />
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
