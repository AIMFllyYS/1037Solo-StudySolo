'use client'

import type { ReactNode } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { getClassUserId } from '@/classolo/lib/db'

import { cn } from '@/classolo/lib/utils'

export function WorkbenchPane({
  title,
  children,
  className,
}: {
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col bg-[color:var(--bg-panel)] text-[color:var(--ink)]',
        className,
      )}
    >
      <header className="border-b border-[color:var(--line-soft)] px-3 py-1.5 text-[11px] font-medium tracking-wide text-[color:var(--ink-faint)]">
        {title}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  )
}

export interface WorkbenchPaneSlots {
  transcript?: ReactNode
  notes?: ReactNode
  transcriptRender?: ReactNode
  notesRender?: ReactNode
}

const HANDLE = 'bg-[color:var(--line-soft)]'

/** SSR-safe 1:1 default split. No Group/Panel — those hydrate with localStorage sizes. */
export function WorkbenchStaticPanes({
  transcript,
  notes,
  transcriptRender,
  notesRender,
}: WorkbenchPaneSlots) {
  return (
    <div
      className="flex h-full min-h-0 w-full"
      data-slot="workbench-static-panes"
    >
      <div className="flex min-h-0 min-w-0 flex-[50] flex-col">
        <div className="min-h-0 min-w-0 flex-[65]">
          <WorkbenchPane title="课堂文稿">{transcript}</WorkbenchPane>
        </div>
        <div className={cn('h-1 shrink-0', HANDLE)} />
        <div className="min-h-0 min-w-0 flex-[35]">
          <WorkbenchPane title="文稿补充">{transcriptRender}</WorkbenchPane>
        </div>
      </div>
      <div className={cn('w-1 shrink-0', HANDLE)} />
      <div className="flex min-h-0 min-w-0 flex-[50] flex-col">
        <div className="min-h-0 min-w-0 flex-[65]">
          <WorkbenchPane title="思维导图">{notes}</WorkbenchPane>
        </div>
        <div className={cn('h-1 shrink-0', HANDLE)} />
        <div className="min-h-0 min-w-0 flex-[35]">
          <WorkbenchPane title="课堂解析">{notesRender}</WorkbenchPane>
        </div>
      </div>
    </div>
  )
}

/** Mount only after hydration. useDefaultLayout reads localStorage during render. */
export function WorkbenchResizablePanes(slots: WorkbenchPaneSlots) {
  const scope = `ss-class-layout:${getClassUserId()}`
  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={`${scope}:columns`}
      className="h-full w-full"
    >
      <Panel defaultSize={50} minSize={25}>
        <PanelGroup direction="vertical" autoSaveId={`${scope}:transcript`}>
          <Panel defaultSize={65} minSize={25}>
            <WorkbenchPane title="课堂文稿">{slots.transcript}</WorkbenchPane>
          </Panel>
          <PanelResizeHandle className={cn('h-1', HANDLE)} />
          <Panel minSize={15}>
            <WorkbenchPane title="文稿补充">{slots.transcriptRender}</WorkbenchPane>
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className={cn('w-1', HANDLE)} />
      <Panel minSize={25}>
        <PanelGroup direction="vertical" autoSaveId={`${scope}:notes`}>
          <Panel defaultSize={65} minSize={25}>
            <WorkbenchPane title="思维导图">{slots.notes}</WorkbenchPane>
          </Panel>
          <PanelResizeHandle className={cn('h-1', HANDLE)} />
          <Panel minSize={15}>
            <WorkbenchPane title="课堂解析">{slots.notesRender}</WorkbenchPane>
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )
}
