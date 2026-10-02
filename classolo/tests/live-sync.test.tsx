import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {setClassUserId,refreshClassSession,getLocalClassSnapshot,insertTranscriptSegments} from '@/classolo/lib/db'
import {startClassLiveSync} from '@/classolo/features/session-library/live-sync'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const session={id:sid,userId:owner,title:'课堂',status:'recording',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),cloudRevision:'0',asrSnapshot:{family:'text',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}}
const blank={session,transcript:[],outline:null,renders:[],chat:[]}
const remote={...blank,session:{...session,cloudRevision:'1'},outline:{revision:7,outline:{nodes:[{id:'root',title:'主题',parentId:null},{id:'child',title:'子点',parentId:'root'}]}}}
beforeEach(()=>{localStorage.clear();setClassUserId(owner);localStorage.setItem(`ss-class:v1:${owner}`,JSON.stringify({sessions:{[sid]:blank},pending:[],cloudVersions:{[sid]:'0'}}))})
afterEach(()=>{setClassUserId(null);vi.unstubAllGlobals();vi.useRealTimers()})
describe('classroom cloud update receiving',()=>{
  it('receives a changed tree and skips expensive snapshot reads when its revision is unchanged',async()=>{
    const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>JSON.parse(String(init.body)).op==='session.version'?Response.json({revision:'1'}):Response.json(remote));vi.stubGlobal('fetch',fetcher)
    expect((await refreshClassSession({userId:owner},sid,()=>false))?.outline?.revision).toBe(7)
    expect(getLocalClassSnapshot(sid)?.outline?.outline.nodes).toEqual(remote.outline.outline.nodes)
    expect(await refreshClassSession({userId:owner},sid,()=>false)).toBeNull();expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('never replaces the recording/importing device with a passive cloud snapshot',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
    expect(await refreshClassSession({userId:owner},sid,()=>true)).toBeNull();expect(fetcher).not.toHaveBeenCalled()
  })
  it('preserves a local edit completed while the remote snapshot was loading',async()=>{
    let reply!:(r:Response)=>void,entered!:()=>void
    const started=new Promise<void>(r=>{entered=r})
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const op=JSON.parse(String(init.body)).op;if(op==='session.version')return Response.json({revision:'1'});if(op==='session.load'){entered();return new Promise<Response>(r=>{reply=r})}return Response.json({ok:true})}))
    const polling=refreshClassSession({userId:owner},sid,()=>false);await started
    const row={id:'33333333-3333-4333-8333-333333333333',sessionId:sid,seq:1,text:'本机新内容',startMs:0,endMs:1000}
    await insertTranscriptSegments({userId:owner},[row]);reply(Response.json(remote));expect(await polling).toBeNull();expect(getLocalClassSnapshot(sid)?.transcript).toEqual([row])
  })
  it('does not apply an old-owner response after an account switch',async()=>{
    let reply!:(r:Response)=>void,entered!:()=>void
    const started=new Promise<void>(r=>{entered=r})
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{if(JSON.parse(String(init.body)).op==='session.version')return Response.json({revision:'1'});entered();return new Promise<Response>(r=>{reply=r})}))
    const polling=refreshClassSession({userId:owner},sid,()=>false);await started;setClassUserId('44444444-4444-4444-8444-444444444444');reply(Response.json(remote))
    expect(await polling).toBeNull();expect(getLocalClassSnapshot(sid)).toBeNull()
  })
  it('stays quiet while hidden, wakes when visible and stops its timers',async()=>{
    vi.useFakeTimers();let visible=false,wake!:()=>void;const poll=vi.fn(async()=>{})
    const stop=startClassLiveSync({poll,isVisible:()=>visible,subscribeWake:cb=>{wake=cb;return()=>{}}})
    await vi.advanceTimersByTimeAsync(30000);expect(poll).not.toHaveBeenCalled()
    visible=true;wake();await vi.advanceTimersByTimeAsync(0);expect(poll).toHaveBeenCalledOnce()
    stop();await vi.advanceTimersByTimeAsync(30000);expect(poll).toHaveBeenCalledOnce()
  })
})
