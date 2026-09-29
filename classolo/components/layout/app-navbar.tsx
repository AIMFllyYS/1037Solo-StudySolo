'use client'

import { Zap } from 'lucide-react'

import { ThemeToggle } from './theme-toggle'

export function AppNavbar() {
  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 shadow-sm backdrop-blur-xl">
      <div className="flex select-none items-center gap-2">
        <ThemeToggle />
        <div className="h-5 w-px bg-border/40" />
        <Zap className="h-5 w-5 fill-primary/20 text-primary" />
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text font-serif text-sm font-bold tracking-tight text-transparent">
          Classolo
        </span>
        <span className="ml-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
          P0
        </span>
      </div>
      <p className="hidden font-serif text-xs text-muted-foreground sm:block">
        课堂工作台
      </p>
    </header>
  )
}
