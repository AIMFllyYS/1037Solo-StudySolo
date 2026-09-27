import assert from 'node:assert/strict';
import {test,mockPaidFetch,fixtureLedger} from '@/tests/helpers/paidAiFixture';
import {billableJsonFetch} from './billableFetch';

test('Zhipu rerank settles measured total input tokens, not a fixed service-request fee',async(t)=>{
 mockPaidFetch(t,async()=>Response.json({results:[],usage:{total_tokens:1000}}));
 const delegate=globalThis.fetch,settles:number[]=[];
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const body=typeof init?.body==='string'?JSON.parse(init.body):{};
  if(String(input).includes('credit_apply')&&body.p_action==='settle')settles.push(body.p_amount);
  return delegate(input,init);
 });
 const response=await billableJsonFetch('https://open.bigmodel.cn/api/paas/v4/rerank',{method:'POST',body:JSON.stringify({model:'rerank',query:'query',documents:['candidate']})},{model:'rerank',kind:'rerank'});
 assert.equal(response.status,200);assert.deepEqual(settles,[800]);
 assert.deepEqual(fixtureLedger.events,['reserve','provider','settle']);
});
test('missing rerank usage holds reservation instead of substituting request count',async(t)=>{
 mockPaidFetch(t,async()=>Response.json({results:[]}));
 await assert.rejects(()=>billableJsonFetch('https://open.bigmodel.cn/api/paas/v4/rerank',{method:'POST',body:JSON.stringify({model:'rerank',query:'query',documents:['candidate']})},{model:'rerank',kind:'rerank'}),/用量/);
 assert.deepEqual(fixtureLedger.events,['reserve','provider']);
});
test('verified image price scales with delivered images and ignores the legacy registry display tariff',async(t)=>{
 mockPaidFetch(t,async()=>Response.json({images:[{url:'https://fixture.invalid/image'}]}));
 const delegate=globalThis.fetch,settles:number[]=[];
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const body=typeof init?.body==='string'?JSON.parse(init.body):{};
  if(String(input).includes('credit_apply')&&body.p_action==='settle')settles.push(body.p_amount);
  return delegate(input,init);
 });
 await billableJsonFetch('https://api.siliconflow.cn/v1/images/generations',{method:'POST',body:JSON.stringify({model:'baidu/ERNIE-Image-Turbo',prompt:'fixture'})},{model:'baidu/ERNIE-Image-Turbo',kind:'image',quantity:2,actualUnits:()=>1});
 assert.deepEqual(settles,[110000]);
});
