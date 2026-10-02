import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const ai=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('@/classolo/lib/ai',()=>({generateText:ai.generate,createModel:vi.fn()}))
import {startOutlineOrganizer} from '@/classolo/features/notes/organizer'
import {getNotesPublic,getRenderMessages} from '@/classolo/lib/session'
import {resetNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic,replaceCommitted} from '@/classolo/lib/session/writes/transcript'
import {resetRenderProjection} from '@/classolo/lib/session/writes/render'
import {setClassUserId} from '@/classolo/lib/db'
import '@/classolo/features/formulas/validate'
const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',segmentId='33333333-3333-4333-8333-333333333333'
const source={id:segmentId,seq:1,text:'老师说二加二等于四。',startMs:0,endMs:8000}
let stop:(()=>void)|undefined
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();setClassUserId(owner);resetTranscriptPublic();resetNotesPublic();resetRenderProjection();ai.generate.mockReset();patchTranscriptPublic({sessionId:lesson,autoOrganize:true,recordingStatus:'recording'})})
afterEach(()=>{stop?.();setClassUserId(null);vi.useRealTimers()})
describe('formula candidates from the real outline schedule',()=>{
  it('puts an anchored renderable and numerically checked formula into the classroom',async()=>{
    ai.generate.mockResolvedValue({text:JSON.stringify({nodes:[],formulas:[{sourceSegmentId:segmentId,spokenText:'二加二等于四',latex:'2+2=4'}]})})
    stop=startOutlineOrganizer();appendCommitted(source);await vi.advanceTimersByTimeAsync(4050)
    const formula=getRenderMessages('transcript').find(message=>message.module==='formula')
    expect(formula?.meta.transcriptAnchor).toBe(segmentId)
    expect(formula?.props).toMatchObject({renderStatus:'valid',semanticStatus:'checked',sourceStatus:'matched',studentConfirmed:false})
  })
  it('drops analysis of a corrected source before it can publish stale nodes or formulas',async()=>{
    let release!:(result:{text:string})=>void
    ai.generate.mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValue({text:JSON.stringify({nodes:[{id:'current',title:'新文稿主题',sourceSegmentIds:[segmentId]}],formulas:[]})})
    stop=startOutlineOrganizer();appendCommitted(source);await vi.advanceTimersByTimeAsync(4000)
    replaceCommitted({...source,text:'老师说新的内容',rawText:source.text,correctionRevision:1})
    release({text:JSON.stringify({nodes:[{id:'stale',title:'旧内容主题',sourceSegmentIds:[segmentId]}],formulas:[{sourceSegmentId:segmentId,spokenText:'二加二等于四',latex:'2+2=4'}]})})
    await vi.advanceTimersByTimeAsync(4100)
    expect(getNotesPublic().outlineDigest.some(node=>node.title==='旧内容主题')).toBe(false)
    expect(getNotesPublic().outlineDigest.some(node=>node.title==='新文稿主题')).toBe(true)
    expect(getRenderMessages('transcript').some(message=>message.module==='formula')).toBe(false)
  })
})
