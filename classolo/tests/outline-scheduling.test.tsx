import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {startOutlineOrganizer} from '@/classolo/features/notes/organizer'
import {patchTranscriptPublic,resetTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {resetNotesPublic} from '@/classolo/lib/session/writes/notes'
import {getNotesPublic} from '@/classolo/lib/session'
let stop:(()=>void)|undefined
beforeEach(()=>{vi.useFakeTimers();resetTranscriptPublic();resetNotesPublic()})
afterEach(()=>{stop?.();vi.useRealTimers()})
describe('outline organizer freshness',()=>{
  it('does not starve when final commits arrive every three seconds',async()=>{
    let commit!:()=>void
    const generate=vi.fn(async()=>[{id:'topic',title:'主题'}])
    stop=startOutlineOrganizer({generate,readTexts:()=>['课堂内容'],subscribeCommitted:cb=>{commit=cb;return()=>{}}})
    for(let i=0;i<20;i++){commit();await vi.advanceTimersByTimeAsync(3000)}
    expect(generate.mock.calls.length).toBeGreaterThanOrEqual(5)
  })
  it('discards an old lesson result and then processes the new lesson',async()=>{
    let commit!:()=>void,release!:(nodes:{id:string;title:string}[])=>void
    patchTranscriptPublic({sessionId:'lesson-a'})
    const generate=vi.fn().mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValue([{id:'new',title:'新课'}])
    stop=startOutlineOrganizer({generate,readTexts:()=>['课堂内容'],subscribeCommitted:cb=>{commit=cb;return()=>{}}})
    commit();await vi.advanceTimersByTimeAsync(4000)
    patchTranscriptPublic({sessionId:'lesson-b'});commit();release([{id:'old',title:'旧课'}])
    await vi.advanceTimersByTimeAsync(4000)
    expect(getNotesPublic().outlineDigest).toEqual([{id:'new',title:'新课'}])
  })
})
