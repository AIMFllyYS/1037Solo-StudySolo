// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({verify:vi.fn(),reserve:vi.fn(),settle:vi.fn(),settleMicro:vi.fn(),cancel:vi.fn(),pricing:vi.fn(),resolveProvider:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/auth/aiGate',()=>({extractAccessToken:()=> 'canonical-token',verifySupabaseAccessToken:mocks.verify}));
vi.mock('@/lib/ai/provider',()=>({ENV_MODEL_FLASH:'safe-model',resolveProvider:mocks.resolveProvider,chatCompletionsUrl:(base:string)=>`${base}/chat/completions`}));
vi.mock('@/lib/ai/models',()=>({getModelInfo:mocks.pricing}));
vi.mock('@/lib/billing/centralCredits',()=>({reserveCredit:mocks.reserve,settleCredit:mocks.settle,settleMicrocredits:mocks.settleMicro,cancelCredit:mocks.cancel,CreditAdmissionError:class extends Error{constructor(message:string,public status:number){super(message);}}}));
import {POST} from '../../app/api/class/ai/chat/completions/route';
import {CreditAdmissionError} from '@/lib/billing/centralCredits';
const user='f1111111-1111-4111-8111-111111111111';
function request(extra:Record<string,unknown>={},headers:Record<string,string>={}){
 return new Request('https://study.1037solo.com/api/class/ai/chat/completions',{method:'POST',headers:{'content-type':'application/json','x-request-id':'f2222222-2222-4222-8222-222222222222',...headers},body:JSON.stringify({messages:[{role:'user',content:'解释课堂概念'}],...extra})});
}
beforeEach(()=>{
 vi.resetAllMocks();mocks.verify.mockResolvedValue({id:user,mfaRequired:false});mocks.pricing.mockReturnValue({pricing:{input:1,output:2}});
 mocks.resolveProvider.mockReturnValue({configured:true,registryId:'safe-model',apiModelId:'z-ai/glm-5.3-flash',billingProvider:'qiniu',apiProtocol:'openai',baseUrl:'https://provider.example/v1',apiKey:'synthetic-server-secret'});
 mocks.reserve.mockResolvedValue({userId:user,requestKey:'fixture',reserved:100000,metadata:{}});mocks.settle.mockResolvedValue(undefined);mocks.settleMicro.mockResolvedValue(undefined);mocks.cancel.mockResolvedValue(undefined);
 mocks.fetch.mockResolvedValue(Response.json({choices:[],usage:{prompt_tokens:10,completion_tokens:3}}));vi.stubGlobal('fetch',mocks.fetch);
});
describe('classroom provider admission',()=>{
 it('never calls provider before authentication',async()=>{mocks.verify.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect(mocks.reserve).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();});
 it('requires MFA before credit or provider calls',async()=>{mocks.verify.mockResolvedValue({id:user,mfaRequired:true});expect((await POST(request())).status).toBe(403);expect(mocks.fetch).not.toHaveBeenCalled();});
 it('fails closed when central credits reject admission',async()=>{mocks.reserve.mockRejectedValue(new CreditAdmissionError('insufficient',402));expect((await POST(request())).status).toBe(402);expect(mocks.fetch).not.toHaveBeenCalled();});
 it('rejects unknown pricing rather than treating it as free',async()=>{mocks.resolveProvider.mockReturnValue({configured:true,registryId:'safe-model',apiModelId:'unknown-model',billingProvider:'unknown-provider',apiProtocol:'openai',baseUrl:'https://provider.example/v1',apiKey:'synthetic-server-secret'});expect((await POST(request())).status).toBe(503);expect(mocks.reserve).not.toHaveBeenCalled();});
 it('bounds output and uses only server-selected model/endpoint/key',async()=>{
  const response=await POST(request({max_tokens:999999,model:'attacker-model',baseUrl:'https://evil.example'}));
  expect(response.status).toBe(200);expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
  const [url,init]=mocks.fetch.mock.calls[0];expect(url).toBe('https://provider.example/v1/chat/completions');
  const body=JSON.parse(init.body);expect(body.model).toBe('z-ai/glm-5.3-flash');expect(body.max_tokens).toBe(4096);expect(body.baseUrl).toBeUndefined();
  expect(mocks.settleMicro).toHaveBeenCalledWith(expect.anything(),17);
 });
 it('keeps unknown upstream outcomes reserved',async()=>{mocks.fetch.mockRejectedValue(new TypeError('network timeout'));expect((await POST(request())).status).toBe(503);expect(mocks.cancel).not.toHaveBeenCalled();expect(mocks.settleMicro).not.toHaveBeenCalled();});
 it('releases reservation only for a definitive rejected upstream request',async()=>{mocks.fetch.mockResolvedValue(new Response('',{status:429}));const res=await POST(request());expect(res.status).toBe(429);expect(res.headers.get('retry-after')).toBeTruthy();expect(mocks.cancel).toHaveBeenCalledOnce();});
 it('keeps other definitive upstream rejections as 502 with the hold released',async()=>{mocks.fetch.mockResolvedValue(new Response('',{status:400}));expect((await POST(request())).status).toBe(502);expect(mocks.cancel).toHaveBeenCalledOnce();});
 it('parses usage across SSE chunks and settles actual usage',async()=>{
  const encoder=new TextEncoder();mocks.fetch.mockResolvedValue(new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode('data: {"usage":{"prompt_tokens":10,'));controller.enqueue(encoder.encode('"completion_tokens":3}}\n\ndata: [DONE]\n\n'));controller.close();}})));
  const response=await POST(request({stream:true}));expect(response.status).toBe(200);expect(await response.text()).toContain('[DONE]');expect(mocks.settleMicro).toHaveBeenCalledWith(expect.anything(),17);
 });
 it('rejects over-limit request bodies without reserving credits',async()=>{expect((await POST(request({}, {'content-length':'999999'}))).status).toBe(413);expect(mocks.reserve).not.toHaveBeenCalled();});
});
