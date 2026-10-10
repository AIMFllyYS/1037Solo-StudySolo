// @vitest-environment node
/** Synthetic owner, in-memory DB and billing mocks. No external state changes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ verify:vi.fn(), reserve:vi.fn(), cancel:vi.fn(), settle:vi.fn(), upsert:vi.fn(), from:vi.fn(), fetch:vi.fn() }))
vi.mock('@/lib/auth/aiGate',()=>({extractAccessToken:()=> 'synthetic-token',verifySupabaseAccessToken:fixture.verify}))
vi.mock('@/lib/auth/serviceClient',()=>({createServiceAuthClient:()=>({from:fixture.from})}))
vi.mock('@/lib/billing/centralCredits',()=>({reserveCredit:fixture.reserve,cancelCredit:fixture.cancel,settleCredit:fixture.settle,CreditAdmissionError:class extends Error{constructor(message:string,public status:number){super(message)}}}))
import { POST as statePost } from '@/app/api/class/state/route'
import { POST as asrPost } from '@/app/api/class/asr/audio/transcriptions/route'

const owner='11111111-1111-4111-8111-111111111111'
const sid='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{
  vi.resetAllMocks()
  fixture.verify.mockResolvedValue({id:owner,mfaRequired:false})
  fixture.reserve.mockResolvedValue({userId:owner,requestKey:'synthetic-admission'})
  fixture.upsert.mockResolvedValue({error:null})
  fixture.from.mockImplementation(()=>{const chain:{[key:string]:unknown}={};chain.select=chain.eq=()=>chain;chain.maybeSingle=async()=>({error:null,data:{id:sid,user_id:owner}});chain.upsert=fixture.upsert;return chain})
  vi.stubEnv('CLASS_ASR_BASE_URL','https://synthetic.invalid/v1');vi.stubEnv('CLASS_ASR_API_KEY','synthetic-only');vi.stubEnv('CLASS_ASR_MODEL','synthetic-model');vi.stubEnv('CLASS_ASR_CNY_PER_SECOND','0.001')
  vi.stubGlobal('fetch',fixture.fetch)
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
const saveOutline=(revision:number)=>new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'outline.save',expectedUserId:owner,input:{sessionId:sid,revision,outline:{nodes:[{id:'root',title:'力学',parentId:null},{id:'child',title:'牛顿定律',parentId:'root'}]}}})})
describe('observed server defects (audit baseline only)',()=>{
  it('A12: the real outline endpoint strips parentId before the database upsert',async()=>{
    expect((await statePost(saveOutline(4))).status).toBe(200)
    expect(fixture.upsert.mock.calls[0][0].payload.nodes).toEqual([{id:'root',title:'力学'},{id:'child',title:'牛顿定律'}])
  })
  it('A13: the outline endpoint accepts a stale revision and overwrites the newer one',async()=>{
    expect((await statePost(saveOutline(41))).status).toBe(200)
    expect((await statePost(saveOutline(1))).status).toBe(200)
    expect(fixture.upsert.mock.calls.map(c=>c[0].revision)).toEqual([41,1])
  })
  it('A14: invalid hotword prompt returns 400 after credit reservation without cancelling it',async()=>{
    const wav=new ArrayBuffer(44+32000),v=new DataView(wav)
    const ascii=(offset:number,text:string)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)))
    ascii(0,'RIFF');ascii(8,'WAVE');ascii(12,'fmt ');ascii(36,'data')
    v.setUint32(4,wav.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,32000,true)
    const form=new FormData();form.append('file',new Blob([wav],{type:'audio/wav'}),'fixture.wav');form.append('prompt','词'.repeat(601))
    const response=await asrPost(new Request('https://local.invalid/api/class/asr/audio/transcriptions',{method:'POST',body:form}))
    expect(response.status).toBe(400);expect(fixture.reserve).toHaveBeenCalledOnce();expect(fixture.cancel).not.toHaveBeenCalled();expect(fixture.fetch).not.toHaveBeenCalled()
  })
})
