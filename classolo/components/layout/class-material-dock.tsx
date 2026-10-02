'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {ChevronDown,ChevronUp,Expand,Layers3,Minimize2,Network} from 'lucide-react'
import {useNotesPublic,useRenderProjection} from '@/classolo/lib/session'
import {RenderHost} from '@/classolo/features/render-modules/host'
import {publishOutlineJump} from '@/classolo/features/notes/jump'

/** A compact, independent surface for live visual material; it never replaces the transcript or map. */
export function ClassMaterialDock({onAnchorClick,compact=false}:{onAnchorClick?:(id:string)=>void;compact?:boolean}){
  const projection=useRenderProjection(state=>state.byId)
  const nodes=useNotesPublic(state=>state.outlineDigest)
  const counts=useMemo(()=>Object.values(projection).reduce((out,message)=>{
    if(message.module==='ai-ask'||message.module==='agent-status')return out
    if(message.target==='transcript')out.transcript++
    if(message.target==='notes')out.notes++
    return out
  },{transcript:0,notes:0}),[projection])
  const total=counts.transcript+counts.notes
  const [open,setOpen]=useState(true),[expanded,setExpanded]=useState(false),[unread,setUnread]=useState(0)
  const previous=useRef({total,nodes:nodes.length})
  useEffect(()=>{
    const added=Math.max(0,total-previous.current.total)+Math.max(0,nodes.length-previous.current.nodes)
    if(added&&!open){setUnread(value=>value+added);setOpen(true)}
    previous.current={total,nodes:nodes.length}
  },[total,nodes.length,open])
  const toggle=()=>{setOpen(value=>!value);setUnread(0)}
  return <aside data-slot="class-material-dock" data-open={open} data-expanded={expanded} data-has-material={total>0} className={`ss-material-dock ${compact?'ss-material-dock--mobile':''} ${expanded?'ss-material-dock--expanded':''}`} aria-label="课堂资料框">
    <div className="ss-material-head">
      <span className="ss-material-icon"><Layers3 className="size-3.5"/></span>
      <strong>随堂资料</strong>
      <span className="ss-material-count">{total} 项{unread?` · 新增 ${unread}`:''}</span>
      {open?<button type="button" aria-label={expanded?'缩小资料框':'扩大资料框'} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize2 className="size-3.5"/>:<Expand className="size-3.5"/>}</button>:null}
      <button type="button" aria-label={open?'收起资料框':'展开资料框'} aria-expanded={open} onClick={toggle}>{open?<ChevronDown className="size-3.5"/>:<ChevronUp className="size-3.5"/>}</button>
    </div>
    {open?<div className="ss-material-body">
      {total===0&&!nodes.length?<p className="ss-material-empty">配图、公式、讲解和题卡出现后会留在这里，听课时不必切换页面。</p>:null}
      {counts.transcript?<section aria-label="文稿补充"><RenderHost target="transcript" modules={['image','formula','rich-text','gen-ui','visual']} compact limit={expanded?undefined:3} onAnchorClick={onAnchorClick}/></section>:null}
      {counts.notes?<section aria-label="笔记补充"><RenderHost target="notes" modules={['image','formula','rich-text','gen-ui','visual']} compact limit={expanded?undefined:2} onAnchorClick={onAnchorClick}/></section>:null}
      {nodes.length?<section aria-label="导图缩览" className="ss-material-outline"><div className="ss-material-section-label"><Network className="size-3"/> 导图缩览 · {nodes.length} 个节点</div><div className="ss-material-node-list">{nodes.slice(0,expanded?18:2).map(node=><button type="button" key={node.id} onClick={()=>publishOutlineJump(node.id)} title={node.title}>{node.title}</button>)}</div></section>:null}
    </div>:null}
  </aside>
}
