import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranscriptFlusher, mergeForFlush } from '@/classolo/features/transcript/flush'

const row=(seq:number)=>({id:`s-${seq}`,seq,startMs:seq*1000,endMs:seq*1000+500,text:'课堂文稿'})
afterEach(()=>vi.useRealTimers())
describe('transcript persistence integrity',()=>{
  it('keeps every permanent segment identity, including short adjacent sentences',()=>{
    const rows=[{...row(1),startMs:0,endMs:1000},{...row(2),startMs:1100,endMs:2000}]
    expect(mergeForFlush(rows)).toEqual(rows)
  })
  it('waits for the active batch and drains a new tail on forced flush',async()=>{
    let release!:()=>void
    const gate=new Promise<void>(r=>{release=r})
    const saved:string[]=[]
    const f=createTranscriptFlusher({persist:async(_id,rows)=>{if(!saved.length)await gate;saved.push(...rows.map(r=>r.id));return rows.length}})
    f.attach('lesson');f.enqueue(row(1));const first=f.flush(true);f.enqueue(row(2))
    let done=false;const drain=f.flush(true).then(value=>{done=true;return value})
    await Promise.resolve();expect(done).toBe(false)
    release();await first;expect(await drain).toBe(true)
    expect(saved).toEqual(['s-1','s-2']);expect(f.pendingCount()).toBe(0)
  })
  it('persists a quiet final tail without another final event',async()=>{
    vi.useFakeTimers();const persist=vi.fn(async()=>1)
    const f=createTranscriptFlusher({persist});f.attach('lesson');f.enqueue(row(1))
    await vi.advanceTimersByTimeAsync(10001)
    expect(persist).toHaveBeenCalledOnce();expect(f.pendingCount()).toBe(0)
  })
  it('retains the original batch on exhausted retries and forbids attach from discarding it',async()=>{
    const overflow=vi.fn(),persist=vi.fn<() => Promise<number>>(async()=>{throw new Error('quota')})
    const f=createTranscriptFlusher({persist,overflow,sleep:async()=>{}})
    f.attach('lesson');f.enqueue(row(1));expect(await f.flush(true)).toBe(false)
    expect(f.pendingCount()).toBe(1);expect(overflow).toHaveBeenCalledOnce()
    expect(()=>f.attach('different-lesson')).toThrow()
    persist.mockImplementation(async()=>1);expect(await f.flush(true)).toBe(true)
    f.attach('different-lesson');expect(f.pendingCount()).toBe(0)
  })
  it('bounds every persisted batch to the server row limit',async()=>{
    const sizes:number[]=[]
    const f=createTranscriptFlusher({persist:async(_s,rows)=>{sizes.push(rows.length);return rows.length}})
    f.attach('lesson');for(let i=1;i<=251;i++)f.enqueue(row(i))
    await f.flush(true);expect(sizes).toEqual([100,100,51])
  })
})
