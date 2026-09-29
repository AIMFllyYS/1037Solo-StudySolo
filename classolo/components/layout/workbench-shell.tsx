'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

import { AppActivityBar } from './app-activity-bar'
import { AppNavbar } from './app-navbar'
import { isWorkbenchNarrow, WORKBENCH_MIN_WIDTH_PX } from './narrow'
import { useIsClient } from './use-is-client'
import {
  WorkbenchResizablePanes,
  WorkbenchStaticPanes,
} from './workbench-panes'

export interface WorkbenchShellProps {
  nav?: ReactNode
  transcript?: ReactNode
  notes?: ReactNode
  transcriptRender?: ReactNode
  notesRender?: ReactNode
  chrome?: boolean
}

function subscribeViewport(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function useViewportWidth() {
  return useSyncExternalStore(
    subscribeViewport,
    () => window.innerWidth,
    () => WORKBENCH_MIN_WIDTH_PX,
  )
}

export function WorkbenchShell({
  transcript,
  notes,
  transcriptRender,
  notesRender,
  chrome = true,
}: WorkbenchShellProps) {
  const isClient = useIsClient()
  const viewportWidth = useViewportWidth()
  const slots = { transcript, notes, transcriptRender, notesRender }

  const panes = !isClient ? (
    <WorkbenchStaticPanes {...slots} />
  ) : isWorkbenchNarrow(viewportWidth) ? (
    <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-2">
      <section className="min-h-64 rounded-xl border border-[color:var(--line-soft)] p-3">{transcript}</section>
      <section className="min-h-80 rounded-xl border border-[color:var(--line-soft)] p-3">{notes}</section>
      <section className="min-h-40 rounded-xl border border-[color:var(--line-soft)] p-3">{transcriptRender}</section>
      <section className="min-h-40 rounded-xl border border-[color:var(--line-soft)] p-3">{notesRender}</section>
    </div>
  ) : (
    <WorkbenchResizablePanes {...slots} />
  )

  if (!chrome) {
    return (
      <div className="h-full min-h-0 w-full" data-slot="workbench-shell">
        {panes}
      </div>
    )
  }

  return (
    <div
      className="flex h-screen min-h-0 w-full flex-col bg-background"
      data-slot="workbench-shell"
    >
      <AppNavbar />
      <div className="flex min-h-0 flex-1">
        <AppActivityBar />
        <div className="min-h-0 min-w-0 flex-1">{panes}</div>
      </div>
    </div>
  )
}
