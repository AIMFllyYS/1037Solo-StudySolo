import { getNotesPublic,getTranscriptPublic,publishCommand } from '@/classolo/lib/session'

export function publishOutlineJump(nodeId: string): boolean {
  const ids=new Set(getTranscriptPublic().committed.map(segment=>segment.id))
  const node=getNotesPublic().outlineDigest.find(node=>node.id===nodeId)
  const segmentId=node?.sourceSegmentIds?.find(id=>ids.has(id))??(ids.has(nodeId)?nodeId:undefined)
  if(!segmentId)return false
  publishCommand({
    type: 'transcript.scrollTo',
    segmentId,
    source: 'notes',
  })
  return true
}
