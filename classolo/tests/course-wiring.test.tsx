// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({verify:vi.fn(),from:vi.fn(),rpc:vi.fn(),insert:vi.fn(),update:vi.fn(),found:null as Record<string,unknown>|null}))
vi.mock('@/lib/auth/aiGate',()=>({extractAccessToken:()=> 'synthetic',verifySupabaseAccessToken:fixture.verify}))
vi.mock('@/lib/auth/serviceClient',()=>({createServiceAuthClient:()=>({from:fixture.from,rpc:fixture.rpc})}))
import {POST} from '@/app/api/class/state/route'
import {classCourseProfileSchema} from '@/classolo/lib/course/profile'
import {readAsrRuntimeConfig} from '@/classolo/features/transcript/asr-config'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'
import {classAgentContextSchema,formatClassContextBlock} from '@/lib/class/agentContext'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const profile=classCourseProfileSchema.parse({disciplineId:'medicine',subdisciplineId:'anatomy',language:'mixed',courseName:'系统解剖',materialSubjectId:'anatomy',customTerms:['锁骨下动脉']})
function request(op:'session.save'|'session.update',input:Record<string,unknown>){return new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,expectedUserId:owner,input:{id:sid,...input}})})}
beforeEach(()=>{
  vi.resetAllMocks();fixture.found=null;fixture.verify.mockResolvedValue({id:owner,mfaRequired:false})
  fixture.insert.mockResolvedValue({error:null});fixture.update.mockResolvedValue({error:null});fixture.rpc.mockResolvedValue({error:null,data:{}})
  fixture.from.mockImplementation(()=>{const chain:Record<string,unknown>={};chain.select=chain.eq=()=>chain;chain.maybeSingle=async()=>({data:fixture.found,error:null});chain.insert=fixture.insert;chain.update=(value:unknown)=>{fixture.update(value);return chain};chain.then=(resolve:(value:unknown)=>void)=>resolve({error:null});chain.upsert=async()=>({error:null});return chain})
})
describe('course profile actually reaches the classroom routes',()=>{
  it('persists the selected subject alongside a new recording session',async()=>{
    const response=await POST(request('session.save',{title:'系统解剖',status:'recording',startedAt:new Date().toISOString(),asrSnapshot:{family:'transcriptions-rest',dialect:'openai-compatible',model:'classroom-asr',baseUrl:'/api/class/asr',sampleRate:16000},profile}))
    expect(response.status).toBe(200);expect(fixture.insert.mock.calls[0][0].payload.profile).toEqual(profile)
  })
  it('changes a saved classification while preserving the original session metadata',async()=>{
    fixture.found={id:sid,user_id:owner,payload:{startedAt:'2026-10-02T00:00:00.000Z',asrSnapshot:{family:'text-import'},profile:{...profile,subdisciplineId:'histology'}}}
    const response=await POST(request('session.update',{profile}))
    expect(response.status).toBe(200);expect(fixture.rpc).toHaveBeenCalledWith('ss_class_patch_session_payload',{p_user_id:owner,p_session_id:sid,p_patch:{profile}})
    expect(fixture.update).not.toHaveBeenCalled()
  })
  it('uses the same bounded set of words for the saved profile and ASR prompt',()=>{
    const plan=planClassHotwords(profile),config=readAsrRuntimeConfig(profile)
    expect(config.hotwords).toEqual(plan.accepted);expect(config.hotwordPrompt).toBe(plan.prompt);expect(config.hotwordPrompt!.length).toBeLessThanOrEqual(600)
  })
  it('tells the main Agent which medical course it is answering in',()=>{
    const ctx=classAgentContextSchema.parse({sessionId:sid,title:'课堂',live:true,profile})
    expect(formatClassContextBlock(ctx)).toContain('医学 · 解剖');expect(formatClassContextBlock(ctx)).toContain('中英混合')
  })
})
