import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {startSilentAgent,resetSilentAgentPrivateState} from '@/classolo/features/agent/silent-machine'
import {patchTranscriptPublic,resetTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
let stop:(()=>void)|undefined
beforeEach(()=>{vi.useFakeTimers();resetTranscriptPublic();resetSilentAgentPrivateState()})
afterEach(()=>{stop?.();resetSilentAgentPrivateState();vi.useRealTimers()})
describe('scoped silent assistant scheduling',()=>{
  it('starts a new lesson after three new segments without inheriting the old count',async()=>{
    let commit!:()=>void,count=20;const tick=vi.fn()
    patchTranscriptPublic({sessionId:'a'})
    stop=startSilentAgent({subscribeCommitted:cb=>{commit=cb;return()=>{}},readCommittedCount:()=>count,onTick:tick})
    commit();await vi.advanceTimersByTimeAsync(6000)
    patchTranscriptPublic({sessionId:'b'});count=3;commit();await vi.advanceTimersByTimeAsync(6000)
    expect(tick).toHaveBeenCalledTimes(2);expect(tick.mock.calls[1][0].lastFiredCount).toBe(3)
  })
  it('coalesces updates during a slow request and executes the pending next batch',async()=>{
    let commit!:()=>void,count=3,release!:()=>void
    const gate=new Promise<void>(r=>{release=r}),tick=vi.fn(async()=>{if(tick.mock.calls.length===1)await gate})
    stop=startSilentAgent({subscribeCommitted:cb=>{commit=cb;return()=>{}},readCommittedCount:()=>count,onTick:tick})
    commit();await vi.advanceTimersByTimeAsync(6000);count=6;commit();await vi.advanceTimersByTimeAsync(15000)
    expect(tick).toHaveBeenCalledOnce();release();await vi.advanceTimersByTimeAsync(0);expect(tick).toHaveBeenCalledTimes(2)
  })
})
