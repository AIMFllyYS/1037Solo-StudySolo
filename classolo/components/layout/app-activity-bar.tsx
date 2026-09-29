'use client'

import { BookOpenText, Mic, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/classolo/lib/utils'

const ITEMS = [
  { href: '/', icon: Mic, label: '工作台' },
  { href: '/settings/', icon: Settings, label: '设置' },
  { href: '/playbook/', icon: BookOpenText, label: 'Playbook' },
] as const

export function AppActivityBar() {
  const pathname = usePathname()

  return (
    <nav className="scrollbar-hide flex h-full w-12 shrink-0 flex-col items-center overflow-y-auto border-r border-border/10 bg-background py-2">
      <div className="flex w-full flex-col items-center space-y-1.5 px-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href.replace(/\/$/, '') ||
                pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl border-[1.5px] transition-all duration-[var(--motion-base)]',
                active
                  ? 'node-paper-bg scale-[1.02] border-primary/30 text-primary shadow-sm'
                  : 'border-transparent text-muted-foreground hover:scale-105 hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <Icon
                className={cn('h-[18px] w-[18px]', active ? 'stroke-[2]' : 'stroke-[1.5]')}
              />
              {active ? (
                <span className="absolute -left-[1.5px] top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-md bg-primary/60" />
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
