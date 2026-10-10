/** Audit probes assert observed defects, not desired product behavior. No real network or credentials. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { resampleTo16k } from '@/classolo/features/transcript/resample'
import { createTranscriptFlusher, mergeForFlush } from '@/classolo/features/transcript/flush'
import { diffOutlineLayout } from '@/classolo/components/mindmap/layout'
import { startOutlineOrganizer, modelOutline } from '@/classolo/features/notes/organizer'
import { startSilentAgent, resetSilentAgentPrivateState } from '@/classolo/features/agent/silent-machine'
import { getNotesPublic } from '@/classolo/lib/session'
import { patchNotesPublic, resetNotesPublic } from '@/classolo/lib/session/writes/notes'
import { resetTranscriptPublic } from '@/classolo/lib/session/writes/transcript'
import { outlineTreeFromLines } from '@/classolo/features/notes/hierarchy'
import { setClassUserId, listSessions, insertTranscriptSegments } from '@/classolo/lib/db'
import { AiAskModule } from '@/classolo/features/render-modules/ai-ask/Component'
import { OpenAiCompatibleTranscriptionsProvider } from '@/classolo/lib/providers/asr/transcriptions-rest/openai-compatible'
import { patchTranscriptPublic } from '@/classolo/lib/session/writes/transcript'

const ai = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/classolo/lib/ai', () => ({ generateText: ai.generate, createModel: vi.fn(), tool: (v: unknown) => v, stepCountIs: vi.fn() }))
const owner = '11111111-1111-4111-8111-111111111111'
const sid = '22222222-2222-4222-8222-222222222222'
const seg = (n: number) => ({ id: `segment-${n}`, seq: n, startMs: n*1000, endMs: n*1000+500, text: `足够长的课堂内容段落${n}` })
const stops: (() => void)[] = []
beforeEach(() => { localStorage.clear(); resetNotesPublic(); resetTranscriptPublic(); resetSilentAgentPrivateState(); setClassUserId(owner); ai.generate.mockReset() })
afterEach(() => { stops.splice(0).forEach(s => s()); cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); resetSilentAgentPrivateState(); setClassUserId(null) })

describe('observed Class defects (audit baseline only)', () => {
  it('A01: stateless 128-sample resampling loses 250 samples per second at 48kHz', () => {
    let total = 0
    for (let n=0; n<375; n++) total += resampleTo16k(new Float32Array(128), 48000).length
    expect(total).toBe(15750)
    expect(total).not.toBe(16000)
  })
  it('A02: force flush during an active write returns before the remaining segment is saved', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release=r })
    const persist = vi.fn(async () => { await gate; return 1 })
    const f = createTranscriptFlusher({persist})
    f.attach(sid); f.enqueue(seg(1))
    const first = f.flush(true); f.enqueue(seg(2))
    expect(await f.flush(true)).toBe(false)
    expect(f.pendingCount()).toBe(1)
    release(); await first
    expect(f.pendingCount()).toBe(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })
  it('A03: the ten-second flush threshold has no timer, so a quiet tail stays in memory', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const persist = vi.fn(async () => 1)
    const f = createTranscriptFlusher({persist})
    f.attach(sid); f.enqueue(seg(1)); expect(await f.flush(false)).toBe(false)
    await vi.advanceTimersByTimeAsync(30000)
    expect(persist).not.toHaveBeenCalled(); expect(f.pendingCount()).toBe(1)
  })
  it('A04: trailing debounce can postpone outline generation indefinitely for commits every 3s', async () => {
    vi.useFakeTimers(); let commit!: () => void
    const generate = vi.fn(async () => [{id:'n',title:'课堂'}])
    stops.push(startOutlineOrganizer({generate, subscribeCommitted: cb => {commit=cb; return () => {}}, readTexts: () => ['课堂内容']}))
    for(let n=0;n<20;n++){commit(); await vi.advanceTimersByTimeAsync(3000)}
    expect(generate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(generate).toHaveBeenCalledOnce()
  })
  it('A05: model outline sees only the last 16 segments and does not receive the previous outline', async () => {
    patchNotesPublic({outlineDigest:[{id:'old',title:'FIRST_TOPIC_UNIQUE'}]})
    ai.generate.mockResolvedValue({text:'最新主题\n  最新子点'})
    const texts=Array.from({length:24},(_,n)=>`SEGMENT_${String(n).padStart(2,'0')}_END`)
    const result=await modelOutline(texts)
    const prompt=ai.generate.mock.calls[0][0].prompt
    expect(prompt).not.toContain(texts[0]); expect(prompt).toContain(texts[8]); expect(prompt).toContain(texts[23])
    expect(prompt).not.toContain('FIRST_TOPIC_UNIQUE'); expect(result.every(n => !n.id.startsWith('segment-'))).toBe(true)
  })
  it('A06: AI outline IDs cannot be used directly as transcript segment anchors', () => {
    const tree=outlineTreeFromLines(['力学','  牛顿定律'])
    expect(tree[0].id).toMatch(/^on-/); expect(tree[1].parentId).toBe(tree[0].id)
    expect(['segment-1','segment-2']).not.toContain(tree[0].id)
  })
  it('A07: loaded outline revision 41 becomes local revision 1 when digest changes', () => {
    patchNotesPublic({outlineDigest:[{id:'node',title:'标题'}],outlineVersion:41})
    expect(getNotesPublic().outlineVersion).toBe(1)
  })
  it('A08: silent-agent segment count from the previous class suppresses a new class', async () => {
    vi.useFakeTimers(); let commit!: () => void; let count=20
    const tick=vi.fn()
    stops.push(startSilentAgent({subscribeCommitted:cb=>{commit=cb;return()=>{}},readCommittedCount:()=>count,onTick:tick}))
    commit(); await vi.advanceTimersByTimeAsync(6000); expect(tick).toHaveBeenCalledOnce()
    count=3; commit(); await vi.advanceTimersByTimeAsync(6000); expect(tick).toHaveBeenCalledOnce()
    count=22; commit(); await vi.advanceTimersByTimeAsync(6000); expect(tick).toHaveBeenCalledOnce()
    count=23; commit(); await vi.advanceTimersByTimeAsync(6000); expect(tick).toHaveBeenCalledTimes(2)
  })
  it('A09: open-ended AiAsk has no answer or explanation action', () => {
    render(<AiAskModule props={{question:'请解释渗透压'}} message={{id:'q',module:'ai-ask',version:'1.0',target:'transcript',props:{question:'请解释渗透压'},meta:{source:'silent-agent',createdAt:0}}}/>)
    expect(screen.getByText('请解释渗透压')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('A10: delayed listSessions overwrites a transcript written during its fetch', async () => {
    const row={id:sid,userId:owner,title:'合成测试',status:'ended',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),asrSnapshot:{family:'text',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}}
    localStorage.setItem(`ss-class:v1:${owner}`,JSON.stringify({sessions:{[sid]:{session:row,transcript:[],outline:null,renders:[],chat:[]}},pending:[]}))
    let reply!: (r: Response) => void; let entered!: () => void
    const started=new Promise<void>(r=>{entered=r})
    const fetcher=vi.fn(async (_u: unknown, init: RequestInit) => {
      const op=JSON.parse(String(init.body)).op
      if(op==='session.list'){entered();return new Promise<Response>(r=>{reply=r})}
      return Response.json({ok:true})
    })
    vi.stubGlobal('fetch',fetcher)
    const listing=listSessions({userId:owner}); await started
    await insertTranscriptSegments({userId:owner},[{...seg(1),sessionId:sid}])
    expect(JSON.parse(localStorage.getItem(`ss-class:v1:${owner}`)!).sessions[sid].transcript).toHaveLength(1)
    reply(Response.json([row])); await listing
    expect(JSON.parse(localStorage.getItem(`ss-class:v1:${owner}`)!).sessions[sid].transcript).toHaveLength(0)
  })
  it('A11: failed ASR slice emits an error and never retries that PCM slice', async () => {
    patchTranscriptPublic({sessionId:sid})
    const transcribe=vi.fn(async()=>{throw new Error('synthetic outage')})
    const error=vi.fn()
    const provider=new OpenAiCompatibleTranscriptionsProvider({family:'transcriptions-rest',baseUrl:'/api/class/asr',apiKey:'',model:'classroom-asr',sampleRate:16000},transcribe)
    provider.onError(error); await provider.start()
    provider.sendAudio(new Int16Array(128000).buffer)
    await provider.stop()
    expect(transcribe).toHaveBeenCalledOnce(); expect(error).toHaveBeenCalledOnce()
  })
  it('A15: keeping old positions while using fresh positions for inserted siblings creates overlaps', () => {
    const root={id:'root',title:'root'}, a={id:'a',title:'a',parentId:'root'}, b={id:'b',title:'b',parentId:'root'}, c={id:'c',title:'c',parentId:'root'}
    const before=diffOutlineLayout([],[root,a,b])
    const after=diffOutlineLayout(before.graph.nodes,[root,a,c,b])
    const positions=Object.fromEntries(after.graph.nodes.map(n=>[n.id,n.position]))
    expect([positions.a,positions.b]).toContainEqual(positions.c)
  })
  it('A16: a slow inflight transcription lets the next PCM buffer exceed the BFF one-minute limit', async () => {
    patchTranscriptPublic({sessionId:sid})
    let release!:(text:string)=>void
    const transcribe=vi.fn().mockImplementationOnce(()=>new Promise<string>(r=>{release=r})).mockResolvedValue('合成内容')
    const provider=new OpenAiCompatibleTranscriptionsProvider({family:'transcriptions-rest',baseUrl:'/api/class/asr',apiKey:'',model:'classroom-asr',sampleRate:16000},transcribe)
    await provider.start(); provider.sendAudio(new Int16Array(128000).buffer)
    provider.sendAudio(new Int16Array(61*16000).buffer)
    const stopping=provider.stop();release('合成内容');await stopping
    expect(transcribe).toHaveBeenCalledTimes(2)
    expect(transcribe.mock.calls[1][0].wav.byteLength).toBe(1952044)
    expect(transcribe.mock.calls[1][0].wav.byteLength).toBeGreaterThan(1920044)
  })
  it('A17: persistence merging removes a segment ID that the live transcript still exposes', () => {
    const rows=[{...seg(1),text:'短句',startMs:0,endMs:1000},{...seg(2),text:'另一句话',startMs:1100,endMs:2000}]
    const merged=mergeForFlush(rows)
    expect(merged).toHaveLength(1);expect(merged[0].id).toBe('segment-1')
    expect(merged.map(r=>r.id)).not.toContain('segment-2')
  })
})
