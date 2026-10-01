// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({verify:vi.fn(),reserve:vi.fn(),cancel:vi.fn(),settle:vi.fn(),fetch:vi.fn()}))
vi.mock('@/lib/auth/aiGate',()=>({extractAccessToken:()=> 'synthetic',verifySupabaseAccessToken:f.verify}))
vi.mock('@/lib/billing/centralCredits',()=>({reserveCredit:f.reserve,cancelCredit:f.cancel,settleCredit:f.settle,CreditAdmissionError:class extends Error{constructor(message:string,public status:number){super(message)}}}))
import {POST} from '@/app/api/class/asr/audio/transcriptions/route'
import {pcm16ToWav} from '@/classolo/lib/providers/asr/transcriptions-rest/openai-compatible'
const owner='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{vi.resetAllMocks();f.verify.mockResolvedValue({id:owner,mfaRequired:false});f.reserve.mockResolvedValue({});vi.stubGlobal('fetch',f.fetch);vi.stubEnv('CLASS_ASR_BASE_URL','https://synthetic.invalid/v1');vi.stubEnv('CLASS_ASR_API_KEY','synthetic');vi.stubEnv('CLASS_ASR_MODEL','synthetic');vi.stubEnv('CLASS_ASR_CNY_PER_SECOND','0.001')})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
function request(prompt='词'){const form=new FormData();form.append('file',new Blob([pcm16ToWav(new Int16Array(16000),16000)]),'test.wav');form.append('prompt',prompt);return new Request('https://local.invalid/api/class/asr/audio/transcriptions',{method:'POST',body:form})}
describe('ASR admission boundaries',()=>{
  it('validates a too-long hotword prompt before reserving any credit',async()=>{expect((await POST(request('词'.repeat(601)))).status).toBe(400);expect(f.reserve).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled()})
  it('marks a definitive provider rejection as retryable after releasing its credit hold',async()=>{f.fetch.mockResolvedValue(new Response('',{status:429}));const response=await POST(request());expect(response.status).toBe(502);expect(await response.json()).toMatchObject({outcome:'retryable'});expect(f.cancel).toHaveBeenCalledOnce()})
  it('keeps a sent-but-disconnected request uncertain without cancellation',async()=>{f.fetch.mockRejectedValue(new TypeError('network disconnected'));const response=await POST(request());expect(await response.json()).toMatchObject({outcome:'uncertain'});expect(f.cancel).not.toHaveBeenCalled()})
})
