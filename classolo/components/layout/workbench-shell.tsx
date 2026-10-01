'use client'

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {AppActivityBar} from './app-activity-bar'
import {AppNavbar} from './app-navbar'

export type ClassWorkspaceTab='notes'|'transcript'|'map'|'resources'|'ask'
export interface WorkbenchShellProps{
  nav?:ReactNode
  note?:ReactNode
  transcript?:ReactNode
  notes?:ReactNode
  transcriptRender?:ReactNode
  notesRender?:ReactNode
  ask?:ReactNode
  chrome?:boolean
  selected?:ClassWorkspaceTab
  onSelect?:(tab:ClassWorkspaceTab)=>void
}
const tabs:{id:ClassWorkspaceTab;label:string}[]=[{id:'notes',label:'笔记'},{id:'transcript',label:'文稿'},{id:'map',label:'导图'},{id:'resources',label:'资料'}]

/** One focused workspace; width is measured from its container, not the browser window. */
export function WorkbenchShell({note,transcript,notes,transcriptRender,notesRender,ask,chrome=true,selected='transcript',onSelect}:WorkbenchShellProps){
  const host=useRef<HTMLDivElement>(null)
  const [compact,setCompact]=useState(false)
  const [compareOpen,setCompareOpen]=useState(false)
  useEffect(()=>{
    const element=host.current;if(!element)return
    const observer=new ResizeObserver(entries=>setCompact((entries[0]?.contentRect.width??element.clientWidth)<720))
    observer.observe(element);return()=>observer.disconnect()
  },[])
  const content=selected==='notes'?note:selected==='transcript'?transcript:selected==='map'?notes:selected==='resources'?<div className="grid min-h-0 gap-5 overflow-auto p-4"><section aria-label="课堂练习与文稿补充"><h2 className="mb-2 text-xs font-semibold text-[color:var(--ink-soft)]">课堂练习与文稿补充</h2>{transcriptRender}</section><section aria-label="资料与解析"><h2 className="mb-2 text-xs font-semibold text-[color:var(--ink-soft)]">资料与解析</h2>{notesRender}</section></div>:ask
  const workspace=<div ref={host} className="flex h-full min-h-0 w-full flex-col bg-[color:var(--bg-panel)]" data-slot="workbench-shell" data-compact={compact}>
    <div role="tablist" aria-label="课堂工作区" className="hidden shrink-0 gap-1 border-b border-[color:var(--line-soft)] px-3 py-2 md:flex">{tabs.map(tab=><button key={tab.id} role="tab" aria-selected={selected===tab.id} type="button" className={`rounded-md px-3 py-1.5 text-[12px] ${selected===tab.id?'bg-[color:var(--accent-weak)] font-semibold text-[color:var(--accent-ink)]':'text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]'}`} onClick={()=>onSelect?.(tab.id)}>{tab.label}</button>)}{selected!=='transcript'&&selected!=='ask'&&<button type="button" className="ml-auto rounded-md px-2 text-[11px] text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]" onClick={()=>setCompareOpen(value=>!value)}>{compareOpen?'关闭对照':'对照文稿'}</button>}</div>
    <div role="tabpanel" className="flex min-h-0 flex-1 overflow-hidden"><div className="min-w-0 flex-1 overflow-hidden">{content}</div>{compareOpen&&selected!=='transcript'&&selected!=='ask'&&<aside aria-label="临时文稿对照" className="hidden w-[38%] min-w-64 border-l border-[color:var(--line-soft)] md:block"><div className="h-full p-3">{transcript}</div></aside>}</div>
    <nav aria-label="手机课堂导航" className="grid shrink-0 grid-cols-4 border-t border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] pb-[env(safe-area-inset-bottom)] md:hidden">{[...tabs.filter(tab=>tab.id!=='resources'),{id:'ask' as const,label:'提问'}].map(tab=><button key={tab.id} type="button" aria-current={selected===tab.id?'page':undefined} onClick={()=>onSelect?.(tab.id)} className={`min-h-12 text-[12px] ${selected===tab.id?'font-semibold text-[color:var(--accent)]':'text-[color:var(--ink-soft)]'}`}>{tab.label}</button>)}</nav>
  </div>
  if(!chrome)return workspace
  return <div className="flex h-screen min-h-0 w-full flex-col bg-background"><AppNavbar/><div className="flex min-h-0 flex-1"><AppActivityBar/><div className="min-h-0 min-w-0 flex-1">{workspace}</div></div></div>
}
