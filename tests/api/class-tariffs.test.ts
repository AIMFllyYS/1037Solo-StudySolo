import assert from 'node:assert/strict';
import {before,after} from 'node:test';
import {test,mockPaidFetch,PaidRequest,fixtureLedger} from '@/tests/helpers/paidAiFixture';
let route:typeof import('@/app/api/class/ai/chat/completions/route');
const keys=['CLASS_AI_MODEL','QINIU_API_KEY','QINIU_BASE_URL','CLASS_IMAGE_SEARCH_API_KEY','CLASS_IMAGE_SEARCH_CNY_PER_CALL'] as const;
const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
before(async()=>{
 process.env.CLASS_AI_MODEL='deepseek/deepseek-v4.1-flash';process.env.QINIU_API_KEY='dummy';process.env.QINIU_BASE_URL='https://api.qnaigc.com/v1';
 route=await import('@/app/api/class/ai/chat/completions/route');
});
after(()=>{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
const request=(stream=false,key=crypto.randomUUID())=>new PaidRequest('https://local.invalid/api/class/ai/chat/completions',{method:'POST',headers:{'content-type':'application/json','x-request-id':key},body:JSON.stringify({messages:[{role:'user',content:'fixture'}],stream,max_tokens:20})});
const usage={prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:20}};

test('Class non-stream uses cache-aware endpoint rate and repeat request never invokes twice',async(t)=>{
 const provider=mockPaidFetch(t,async()=>Response.json({choices:[{message:{content:'fixture'}}],usage}));
 const delegate=globalThis.fetch,amounts:number[]=[];
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const body=typeof init?.body==='string'?JSON.parse(init.body):{};
  if(String(input).includes('credit_apply')&&body.p_action==='settle')amounts.push(body.p_amount);
  return delegate(input,init);
 });
 const key=crypto.randomUUID();assert.equal((await route.POST(request(false,key))).status,200);
 assert.deepEqual(amounts,[241]);assert.equal((await route.POST(request(false,key))).status,409);assert.equal(provider.mock.callCount(),1);
});
test('Class terminal SSE frames wait for central settlement; missing usage retains funds',async(t)=>{
 let missing=false;
 mockPaidFetch(t,async()=>new Response([
  {choices:[{delta:{content:'text'},finish_reason:null}]},
  {choices:[{delta:{},finish_reason:'stop'}],...(missing?{}:{usage})},
 ].map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}));
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;}),delegate=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const body=typeof init?.body==='string'?JSON.parse(init.body):{};
  if(String(input).includes('credit_apply')&&body.p_action==='settle'){entered();await gate;}
  return delegate(input,init);
 });
 const response=await route.POST(request(true));const reader=response.body!.getReader();
 const first=await reader.read();assert.doesNotMatch(new TextDecoder().decode(first.value),/\[DONE\]|"finish_reason":"stop"/);
 await started;assert.equal(fixtureLedger.events.includes('settle'),false);release();
 let received='';while(true){const part=await reader.read();if(part.done)break;received+=new TextDecoder().decode(part.value);}
 assert.match(received,/\[DONE\]/);assert.equal(fixtureLedger.events.includes('settle'),true);
 missing=true;fixtureLedger.events.length=0;const uncertain=await route.POST(request(true));await assert.rejects(uncertain.text(),/用量/);
 assert.deepEqual(fixtureLedger.events,['reserve','provider']);
});
test('Class image search accepts explicit zero, while missing rate is not free',async(t)=>{
 process.env.CLASS_IMAGE_SEARCH_API_KEY='dummy';process.env.CLASS_IMAGE_SEARCH_CNY_PER_CALL='0';
 const imageRoute=await import('@/app/api/class/image-search/route');
 const provider=mockPaidFetch(t,async()=>Response.json({results:[]}));
 const make=()=>new PaidRequest('https://local.invalid/api/class/image-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'fixture'})});
 assert.equal((await imageRoute.POST(make())).status,200);
 delete process.env.CLASS_IMAGE_SEARCH_CNY_PER_CALL;
 assert.equal((await imageRoute.POST(make())).status,503);assert.equal(provider.mock.callCount(),1);
});
