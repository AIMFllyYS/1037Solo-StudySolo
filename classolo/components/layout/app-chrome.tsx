import type { ReactNode } from 'react'

import { AppActivityBar } from './app-activity-bar'
import { AppNavbar } from './app-navbar'

export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <AppNavbar />
      <div className="flex min-h-0 flex-1">
        <AppActivityBar />
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
