import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {hydrateClassSnapshot} from '@/classolo/features/session-library/hydrate'
import {setClassUserId,isClassHydrating,type ClassSnapshot} from '@/classolo/lib/db'
import {getNotesPublic,getTranscriptPublic} from '@/classolo/lib/session'
import {subscribeNotesPublic} from '@/classolo/lib/session/reads/notes'
import {resetNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,patchTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {resetTranscriptPrivate,patchTranscriptPrivate} from '@/classolo/features/transcript/private-store'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const snapshot:ClassSnapshot={session:{id:sid,userId:owner,title:'远端课堂',status:'recording',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),asrSnapshot:{family:'text',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}},transcript:[{id:'s-1',sessionId:sid,seq:1,startMs:0,endMs:1000,text:'远端文稿'}],outline:{revision:8,outline:{nodes:[{id:'node',title:'远端主题',sourceSegmentIds:['s-1']}],processedSegments:{'s-1':{chars:4,fingerprint:'hash'}}}},renders:[],chat:[]}
beforeEach(()=>{setClassUserId(owner);resetNotesPublic();resetTranscriptPublic();resetTranscriptPrivate()})
afterEach(()=>setClassUserId(null))
describe('class snapshot projection',()=>{
  it('restores tree and progress without starting recording or writing the hydrated revision back',()=>{
    const writes=vi.fn(),stop=subscribeNotesPublic(s=>s.outlineVersion,()=>{if(!isClassHydrating())writes()})
    expect(hydrateClassSnapshot(snapshot)).toBe(true)
    expect(getNotesPublic()).toMatchObject({outlineVersion:8,processedSegments:{'s-1':{chars:4,fingerprint:'hash'}}})
    expect(getTranscriptPublic()).toMatchObject({sessionId:sid,recordingStatus:'stopped',autoOrganize:false})
    expect(writes).not.toHaveBeenCalled();stop()
  })
  it('refuses a wrong owner and refuses to replace active recording/startup state',()=>{
    expect(hydrateClassSnapshot({...snapshot,session:{...snapshot.session,userId:'different'}})).toBe(false)
    patchTranscriptPublic({sessionId:sid,recordingStatus:'recording'});expect(hydrateClassSnapshot(snapshot)).toBe(false)
    patchTranscriptPublic({recordingStatus:'stopped'});patchTranscriptPrivate({lifecycle:'starting'});expect(hydrateClassSnapshot(snapshot)).toBe(false)
  })
  it('shows a saved correction after reopening without changing the original ASR row',()=>{
    const withCorrection={...snapshot,corrections:[{sessionId:sid,segmentId:'s-1',revision:1,correctedText:'更正后的文稿',history:[]}]}
    expect(hydrateClassSnapshot(withCorrection)).toBe(true)
    expect(getTranscriptPublic().committed[0]).toMatchObject({id:'s-1',text:'更正后的文稿',rawText:'远端文稿',correctionRevision:1})
    expect(snapshot.transcript[0].text).toBe('远端文稿')
  })
})
