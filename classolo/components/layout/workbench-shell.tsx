'use client'

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {Map,MessageCircleQuestion,NotebookPen,ScrollText} from 'lucide-react'
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels'
import {AppActivityBar} from './app-activity-bar'
import {AppNavbar} from './app-navbar'

export interface WorkbenchShellProps{
  transcript?:ReactNode
  mindmap?:ReactNode
  materials?:ReactNode
  ask?:ReactNode
  askOpen?:boolean
  onAskOpenChange?:(value:boolean)=>void
  onOpenNotes?:()=>void
  chrome?:boolean
}

/** Transcript, map and materials share one surface; resizing never hides their state. */
export function WorkbenchShell({transcript,mindmap,materials,ask,askOpen=false,onAskOpenChange,onOpenNotes,chrome=true}:WorkbenchShellProps){
  const host=useRef<HTMLDivElement>(null)
  const [compact,setCompact]=useState(false)
  useEffect(()=>{
    const element=host.current;if(!element)return
    const observer=new ResizeObserver(entries=>setCompact((entries[0]?.contentRect.width??element.clientWidth)<740))
    observer.observe(element);return()=>observer.disconnect()
  },[])
  const jump=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})
  const workspace=<div ref={host} data-slot="workbench-shell" data-compact={compact} className="relative flex h-full min-h-0 w-full flex-col bg-[color:var(--bg-panel)]">
    {compact?<div className="ss-class-mobile-stack min-h-0 flex-1 overflow-auto">
      <section id="class-transcript-panel" aria-label="课堂文稿" className="ss-class-transcript-panel min-h-[48vh]">{transcript}</section>
      <section id="class-map-panel" aria-label="课堂导图" className="ss-class-map-panel min-h-[48vh]"><header><Map className="size-3.5"/><strong>课堂导图</strong><span>可拖动、缩放和回跳文稿</span></header><div className="min-h-[40vh] flex-1">{mindmap}</div></section>
      <div className="ss-class-mobile-material">{materials}</div>
    </div>:<div className="relative min-h-0 flex-1">
      <PanelGroup direction="vertical" autoSaveId="ss-class-main-v4" className="h-full min-h-0">
        <Panel defaultSize={40} minSize={25} className="min-h-0"><section id="class-transcript-panel" aria-label="课堂文稿" className="ss-class-transcript-panel h-full min-h-0">{transcript}</section></Panel>
        <PanelResizeHandle className="ss-class-split-handle" aria-label="调整文稿与导图高度"/>
        <Panel defaultSize={60} minSize={23} className="min-h-0"><section id="class-map-panel" aria-label="课堂导图" className="ss-class-map-panel h-full min-h-0"><header><Map className="size-3.5"/><strong>课堂导图</strong><span>可拖动、缩放和回跳文稿</span></header><div className="min-h-0 flex-1">{mindmap}</div></section></Panel>
      </PanelGroup>
      {materials}
    </div>}
    {compact?<nav aria-label="课堂快速操作" className="ss-class-quick-actions"><button type="button" onClick={()=>jump('class-transcript-panel')}><ScrollText className="size-4"/>文稿</button><button type="button" onClick={()=>jump('class-map-panel')}><Map className="size-4"/>导图</button><button type="button" onClick={onOpenNotes}><NotebookPen className="size-4"/>笔记</button><button type="button" onClick={()=>onAskOpenChange?.(true)}><MessageCircleQuestion className="size-4"/>提问</button></nav>:null}
    {compact&&askOpen?<div className="ss-class-ask-overlay" role="dialog" aria-label="课堂助教"><button type="button" className="ss-class-ask-close" onClick={()=>onAskOpenChange?.(false)}>返回课堂</button><div className="min-h-0 flex-1">{ask}</div></div>:null}
  </div>
  if(!chrome)return workspace
  return <div className="flex h-screen min-h-0 w-full flex-col bg-background"><AppNavbar/><div className="flex min-h-0 flex-1"><AppActivityBar/><div className="min-h-0 min-w-0 flex-1">{workspace}</div></div></div>
}
