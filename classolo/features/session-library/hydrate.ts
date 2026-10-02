import {getClassUserId,setClassHydrating,type ClassSnapshot} from '@/classolo/lib/db'
import {getTranscriptPublic} from '@/classolo/lib/session'
import {hydrateTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {patchNotesPublic,resetNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetRenderProjection,upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {outlineSchema} from '@/classolo/lib/session/outline-schema'
import {getTranscriptPrivate} from '@/classolo/features/transcript/private-store'
import type {CorrectionRecord} from '@/classolo/features/transcript/term-correction'
import type {TranscriptRow} from '@/classolo/lib/db'
import type {RenderMessage} from '@/classolo/features/render-modules/types'

export function hydrateClassSnapshot(data:ClassSnapshot):boolean{
  const current=getTranscriptPublic()
  if(data.session.userId!==getClassUserId())return false
  if(current.recordingStatus==='recording'||current.recordingStatus==='paused'||getTranscriptPrivate().lifecycle!=='idle')return false
  setClassHydrating(true)
  try{
    if(current.sessionId!==data.session.id)resetRenderProjection()
    hydrateTranscriptPublic(data.session.id,projectClassTranscript(data.transcript,data.corrections??[]));resetNotesPublic()
    const outline=outlineSchema.safeParse(data.outline?.outline??{nodes:[]})
    if(outline.success)patchNotesPublic({outlineDigest:outline.data.nodes,processedSegments:outline.data.processedSegments??{},outlineVersion:data.outline?.revision||0})
    for(const row of data.renders)upsertRenderMessage({id:row.id,module:row.module,version:row.version,target:row.target as RenderMessage['target'],props:row.props,meta:{source:row.source as RenderMessage['meta']['source'],createdAt:new Date(row.createdAt||Date.now()).getTime(),...(row.transcriptAnchor?{transcriptAnchor:row.transcriptAnchor}:{})}})
    return true
  }finally{setClassHydrating(false)}
}

export function projectClassTranscript(rows:readonly TranscriptRow[],corrections:readonly CorrectionRecord[]){
  const bySegment=new Map(corrections.map(row=>[row.segmentId,row]))
  return rows.map(row=>{
    const correction=bySegment.get(row.id)
    return {...row,rawText:row.text,text:correction?.correctedText??row.text,correctionRevision:correction?.revision??0}
  })
}
