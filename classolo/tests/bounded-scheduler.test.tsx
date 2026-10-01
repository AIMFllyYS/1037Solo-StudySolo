import {afterEach,describe,expect,it,vi} from 'vitest'
import {createBoundedScheduler} from '@/classolo/lib/session/bounded-scheduler'
afterEach(()=>vi.useRealTimers())
describe('bounded classroom background work',()=>{
  it('starts by maxWait during an uninterrupted event stream',async()=>{
    vi.useFakeTimers();const run=vi.fn(async()=>{})
    const task=createBoundedScheduler({delayMs:4000,maxWaitMs:10000,run})
    for(let i=0;i<20;i++){task.schedule();await vi.advanceTimersByTimeAsync(3000)}
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(5);task.stop()
  })
  it('coalesces updates while one model request is blocked and catches up afterward',async()=>{
    vi.useFakeTimers();let release!:()=>void
    const gate=new Promise<void>(r=>{release=r}),run=vi.fn(async()=>{if(run.mock.calls.length===1)await gate})
    const task=createBoundedScheduler({delayMs:4000,maxWaitMs:10000,run})
    task.schedule();await vi.advanceTimersByTimeAsync(4000)
    for(let i=0;i<10;i++){task.schedule();await vi.advanceTimersByTimeAsync(2000)}
    expect(run).toHaveBeenCalledOnce();release();await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(2);task.stop()
  })
  it('aborts old-scope work and prevents pending timers after stop',async()=>{
    vi.useFakeTimers();let signal!:AbortSignal
    const task=createBoundedScheduler({delayMs:10,maxWaitMs:20,run:async s=>{signal=s;await new Promise<void>(r=>s.addEventListener('abort',()=>r(),{once:true}))}})
    task.schedule();await vi.advanceTimersByTimeAsync(10);task.reset();expect(signal.aborted).toBe(true)
    task.schedule();task.stop();await vi.advanceTimersByTimeAsync(100);expect(vi.getTimerCount()).toBe(0)
  })
})
