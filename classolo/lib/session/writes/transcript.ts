import {
  initialTranscriptPublic,
  transcriptPublicStore,
} from '../reads/transcript'
import type { TranscriptCommittedSegment, TranscriptPublic } from '../types'

export function patchTranscriptPublic(
  patch: Partial<
    Pick<TranscriptPublic, 'sessionId' | 'recordingStatus' | 'latestCommittedId'|'autoOrganize'>
  >,
): void {
  transcriptPublicStore.setState(patch)
}

export function appendCommitted(segment: TranscriptCommittedSegment): void {
  if(transcriptPublicStore.getState().committed.some(row=>row.id===segment.id))return
  transcriptPublicStore.setState((state) => ({
    committed: [...state.committed, segment].sort((a,b)=>a.seq-b.seq),
    committedVersion: state.committedVersion + 1,
    latestCommittedId: segment.id,
  }))
}

export function resetTranscriptPublic(): void {
  transcriptPublicStore.setState(initialTranscriptPublic,true)
}

export function replaceCommitted(segment:TranscriptCommittedSegment):void{
  transcriptPublicStore.setState(state=>{
    const index=state.committed.findIndex(row=>row.id===segment.id)
    if(index<0||((state.committed[index].correctionRevision??0)>(segment.correctionRevision??0)))return state
    return {committed:state.committed.map(row=>row.id===segment.id?segment:row),committedVersion:state.committedVersion+1,latestCommittedId:segment.id}
  })
}

export function hydrateTranscriptPublic(sessionId:string,segments:readonly TranscriptCommittedSegment[]):void{
  const committed=[...new Map(segments.map(segment=>[segment.id,segment])).values()].sort((a,b)=>a.seq-b.seq)
  transcriptPublicStore.setState({sessionId,recordingStatus:'stopped',autoOrganize:false,committed,committedVersion:transcriptPublicStore.getState().committedVersion+1,latestCommittedId:committed.at(-1)?.id??null},true)
}
