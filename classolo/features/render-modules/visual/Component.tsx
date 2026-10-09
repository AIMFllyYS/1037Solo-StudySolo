'use client'

import {DiagramCanvas} from '@/components/canvas/DiagramCanvas'
import {useTranscriptPublic} from '@/classolo/lib/session'
import type {RenderMessage} from '../types'
import type {VisualProps} from './schema'

export function VisualModule({props}:{props:VisualProps;message:RenderMessage<VisualProps>;onAnchorClick?:(segmentId:string)=>void}){
  const source=useTranscriptPublic(state=>state.committed.find(row=>row.id===props.sourceSegmentId))
  const stale=!!props.sourceSegmentId&&(!source||source.correctionRevision!==props.sourceRevision)
  return <figure data-slot="class-visual" className="ss-class-visual">
    <div className="ss-class-visual-head">
      <span className="ss-class-visual-title" title={props.title}>{props.title}</span>
      <span className="ss-class-visual-badge" data-stale={stale||undefined}>{stale?'来源文稿已更正':'AI 示意'}</span>
    </div>
    <div className="ss-class-visual-frame">
      <DiagramCanvas mode={props.kind==='svg'?'raw':props.kind==='plot'?'math':'molecule'} content={props.content} title={props.title} attrs={props.kind==='plot'?{fn:props.content,xmin:props.plot?.xmin,xmax:props.plot?.xmax}:{}}/>
    </div>
    <figcaption className="ss-class-visual-note">{props.kind==='molecule'?'SMILES 由 RDKit 解析；请核对化学结构':'示意内容由 AI 生成，请结合原文核对'}</figcaption>
  </figure>
}
