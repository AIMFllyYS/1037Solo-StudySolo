import {beforeEach,describe,expect,it,vi} from 'vitest'
import {publishOutlineJump} from '@/classolo/features/notes/jump'
import {subscribeCommands,resetCommandBus} from '@/classolo/lib/session/commands'
import {resetNotesPublic,patchNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,appendCommitted} from '@/classolo/lib/session/writes/transcript'
beforeEach(()=>{resetNotesPublic();resetTranscriptPublic();resetCommandBus();appendCommitted({id:'real-segment',seq:1,text:'课堂原文',startMs:0,endMs:1000})})
describe('mindmap provenance navigation',()=>{
  it('uses a source segment instead of the node identity',()=>{
    patchNotesPublic({outlineDigest:[{id:'node-uuid',title:'主题',sourceSegmentIds:['real-segment']}]})
    const command=vi.fn(),stop=subscribeCommands(command)
    expect(publishOutlineJump('node-uuid')).toBe(true);expect(command).toHaveBeenCalledWith({type:'transcript.scrollTo',segmentId:'real-segment',source:'notes'});stop()
  })
  it('refuses a fabricated/legacy anchor rather than publishing an unresolvable command',()=>{
    patchNotesPublic({outlineDigest:[{id:'old-node',title:'旧主题',sourceSegmentIds:['missing']}]})
    const command=vi.fn(),stop=subscribeCommands(command);expect(publishOutlineJump('old-node')).toBe(false);expect(command).not.toHaveBeenCalled();stop()
  })
})
