import {afterEach,describe,expect,it,vi} from 'vitest'
import {startCapture,stopCapture} from '@/classolo/features/transcript/capture'
import {getTranscriptPrivate,resetTranscriptPrivate} from '@/classolo/features/transcript/private-store'

afterEach(async()=>{vi.useRealTimers();await stopCapture(false);resetTranscriptPrivate()})

describe('microphone start',()=>{
  it('returns an actionable timeout instead of leaving the start button disabled forever',async()=>{
    vi.useFakeTimers()
    const opening=startCapture({getUserMedia:()=>new Promise<MediaStream>(()=>{}),AudioContext:class {} as typeof AudioContext})
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await opening).toBe(false)
    expect(getTranscriptPrivate().error).toContain('等待超时')
  })

  it('cancels promptly and stops a stream granted after cancellation',async()=>{
    let grant!:(stream:MediaStream)=>void
    const opening=startCapture({getUserMedia:()=>new Promise(resolve=>{grant=resolve}),AudioContext:class {} as typeof AudioContext})
    await stopCapture(false)
    expect(await opening).toBe(false)
    const stop=vi.fn()
    grant({getTracks:()=>[{stop}]} as unknown as MediaStream)
    await Promise.resolve()
    expect(stop).toHaveBeenCalledOnce()
  })
})
