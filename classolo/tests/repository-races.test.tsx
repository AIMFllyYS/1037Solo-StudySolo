import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {setClassUserId,listSessions,loadClassSession,insertTranscriptSegments,upsertNoteOutline,getClassOutlineConflict,getLocalClassSnapshot,resolveClassOutlineConflict,getPendingCount} from '@/classolo/lib/db'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const session={id:sid,userId:owner,title:'课堂',status:'ended',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),asrSnapshot:{family:'text',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}}
const blank={session,transcript:[],outline:null,renders:[],chat:[]}
const row={id:'33333333-3333-4333-8333-333333333333',sessionId:sid,seq:1,startMs:0,endMs:1000,text:'新文稿'}
beforeEach(()=>{localStorage.clear();setClassUserId(owner);localStorage.setItem(`ss-class:v1:${owner}`,JSON.stringify({sessions:{[sid]:blank},pending:[]}))})
afterEach(()=>{setClassUserId(null);vi.unstubAllGlobals()})
describe('class repository concurrent reads and writes',()=>{
  for(const op of ['session.list','session.load'])it(`${op} preserves writes completed while its response was in flight`,async()=>{
    let reply!:(r:Response)=>void,entered!:()=>void
    const started=new Promise<void>(r=>{entered=r})
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{if(JSON.parse(String(init.body)).op===op){entered();return new Promise<Response>(r=>{reply=r})}return Response.json({ok:true})}))
    const reading=op==='session.list'?listSessions({userId:owner}):loadClassSession({userId:owner},sid)
    await started;await insertTranscriptSegments({userId:owner},[row]);reply(Response.json(op==='session.list'?[session]:blank));await reading
    expect(getLocalClassSnapshot(sid)?.transcript).toEqual([row])
  })
  it('retains an outline conflict and still synchronizes transcript writes',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>JSON.parse(String(init.body)).op==='outline.save'?Response.json({code:'OUTLINE_CONFLICT',revision:8,outline:{nodes:[{id:'remote',title:'云端'}]},error:'conflict'},{status:409}):Response.json({ok:true})))
    await upsertNoteOutline({userId:owner},{sessionId:sid,revision:1,outline:{nodes:[{id:'local',title:'本地'}]}})
    await insertTranscriptSegments({userId:owner},[row])
    expect(getClassOutlineConflict(sid)?.revision).toBe(8);expect(getLocalClassSnapshot(sid)?.outline?.outline.nodes).toEqual([{id:'local',title:'本地'}]);expect(getPendingCount()).toBe(0)
    await resolveClassOutlineConflict({userId:owner},sid,'remote')
    expect(getLocalClassSnapshot(sid)?.outline?.revision).toBe(8);expect(getClassOutlineConflict(sid)).toBeNull()
  })
  it('explicit local conflict resolution sends the cloud base revision and a fresh next revision',async()=>{
    let conflict=true;const bodies:Record<string,unknown>[]=[]
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body));bodies.push(body.input);return conflict?Response.json({code:'OUTLINE_CONFLICT',revision:8,outline:{nodes:[]},error:'conflict'},{status:409}):Response.json({ok:true,revision:9})}))
    await upsertNoteOutline({userId:owner},{sessionId:sid,revision:1,outline:{nodes:[{id:'local',title:'本地'}]}})
    conflict=false;await resolveClassOutlineConflict({userId:owner},sid,'local')
    expect(bodies.at(-1)).toMatchObject({expectedRevision:8,revision:9});expect(getLocalClassSnapshot(sid)?.outline?.outline.nodes).toEqual([{id:'local',title:'本地'}])
  })
})
