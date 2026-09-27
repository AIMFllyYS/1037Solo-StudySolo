import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tokenTariff,tierPrice,reservationPrice} from './tariffs';
import {measuredTokens,usageMicrocredits,withProviderAdmission,type CreditDriver} from './providerAdmission';
import {runPaidContext} from './paidContext';
import type {LanguageModelV4} from '@ai-sdk/provider';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';

test('same upstream model lands at different Qiniu and relay rates, ignoring model-only override',()=>{
 const saved=process.env.ECOSYSTEM_MODEL_PRICES_JSON;
 process.env.ECOSYSTEM_MODEL_PRICES_JSON=JSON.stringify({'deepseek/deepseek-v4.1-flash':{input:0,output:0,cachedInput:0}});
 try{
  assert.equal(tierPrice(tokenTariff('qiniu','deepseek/deepseek-v4.1-flash'),1).input,2);
  assert.equal(tierPrice(tokenTariff('relay','deepseek/deepseek-v4.1-flash'),1).input,1.043);
 }finally{if(saved===undefined)delete process.env.ECOSYSTEM_MODEL_PRICES_JSON;else process.env.ECOSYSTEM_MODEL_PRICES_JSON=saved;}
});
test('whole-request tiers use total input including caches with exact inclusive/exclusive boundaries',()=>{
 const t=tokenTariff('relay','gpt-5.6-sol');
 assert.equal(tierPrice(t,272000).input,35);assert.equal(tierPrice(t,272001).input,70);
 const grok=tokenTariff('relay2','grok-4.6');assert.equal(tierPrice(grok,199999).input,4.2);assert.equal(tierPrice(grok,200000).input,8.4);
 assert.equal(reservationPrice(t,300000).input,87.5);
 assert.equal(usageMicrocredits({input:272001,cached:272000,written:1,output:1},tierPrice(t,272001)),1904403);
});
test('native Anthropic excludes cache in raw input; SDK/OpenAI totals include it exactly once',()=>{
 assert.deepEqual(measuredTokens({input_tokens:10,output_tokens:3,cache_read_input_tokens:20,cache_creation_input_tokens:5}),{input:35,output:3,cached:20,written:5});
 assert.deepEqual(measuredTokens({prompt_tokens:35,completion_tokens:3,prompt_tokens_details:{cached_tokens:20,cache_write_tokens:5}}),{input:35,output:3,cached:20,written:5});
 assert.deepEqual(measuredTokens({inputTokens:{total:35,cacheRead:20,cacheWrite:5},outputTokens:{total:3}}),{input:35,output:3,cached:20,written:5});
 assert.throws(()=>measuredTokens({prompt_tokens:5,completion_tokens:1,prompt_tokens_details:{cached_tokens:-1}}));
 assert.equal(measuredTokens({inputTokens:{total:0},outputTokens:{total:0},raw:{}}),null);
});
test('unknown group/context tariff stays disabled; MiMo is explicitly operator tariff',()=>{
 assert.throws(()=>tokenTariff('relay','Qwen/Qwen3.7-Flash'),/分档/);
 assert.throws(()=>tokenTariff('relay','gpt-5.6-luna'),/Codex/);
 assert.throws(()=>tokenTariff('bcai','claude-opus-4-8'));
 const t=tokenTariff('relay','mimo-v2.6-pro');assert.equal(t.supplierQuoteVerified,false);assert.match(t.source,/operator-platform/);
});

test('invalid tier tables never fall back to the base low rate',()=>{
 const old=process.env.ECOSYSTEM_ENDPOINT_PRICES_JSON;
 const entry={unit:'tokens',currency:'CNY',source:'fixture',verifiedAt:'2026-09-27',price:{input:1,output:1,cachedInput:1}};
 try{
  for(const tiers of [[],null,[{maxInputTokens:100,input:1,output:1,cachedInput:1}]]){
   process.env.ECOSYSTEM_ENDPOINT_PRICES_JSON=JSON.stringify({'fixture:model':{...entry,tiers}});
   assert.throws(()=>tokenTariff('fixture','model'),/分档/);
  }
 }finally{if(old===undefined)delete process.env.ECOSYSTEM_ENDPOINT_PRICES_JSON;else process.env.ECOSYSTEM_ENDPOINT_PRICES_JSON=old;}
});

test('actual OpenAI SDK raw cache-write extensions survive normalization, empty usage never becomes free',async(t)=>{
 let rawUsage:Record<string,unknown>={prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:20},cache_creation_input_tokens:30};
 t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{index:0,message:{role:'assistant',content:'fixture'},finish_reason:'stop'}],usage:rawUsage}));
 const base=createOpenAICompatible({name:'fixture',baseURL:'https://fixture.invalid/v1',apiKey:'dummy'})('gpt-5.6-sol');
 const charged:number[]=[];
 const credits:CreditDriver={async reserve(userId,requestKey,cny,metadata){return {userId,requestKey,reserved:Math.ceil(cny*1e6),metadata};},async settleMicro(_,amount){charged.push(amount);},async cancel(){assert.fail('unknown usage must not refund');}};
 const m=withProviderAdmission(base,'gpt-5.6-sol',false,credits,{provider:'relay',model:'gpt-5.6-sol'});
 const params={prompt:[{role:'user' as const,content:[{type:'text' as const,text:'fixture'}]}],maxOutputTokens:20};
 const run=async()=>await runPaidContext({userId:'00000000-0000-4000-8000-000000000001',requestId:crypto.randomUUID(),route:'test',sequence:0,reservedCny:0},()=>m.doGenerate(params));
 const result=await run();assert.equal(result.usage.inputTokens.cacheWrite,30);assert.deepEqual(charged,[5233]);
 rawUsage={};await assert.rejects(run,/用量/);assert.deepEqual(charged,[5233]);
});
test('reservation captures tiers and stream settlement uses actual high tier before finish delivery',async()=>{
 const events:string[]=[];let amount=-1;let snapshot:unknown;
 const credits:CreditDriver={async reserve(userId,requestKey,cny,metadata){snapshot=metadata.priceSnapshot;events.push('reserve');return {userId,requestKey,reserved:Math.ceil(cny*1e6),metadata};},async settleMicro(_,cost){amount=cost;events.push('settle');},async cancel(){events.push('cancel');}};
 const usage={inputTokens:{total:272001,noCache:1,cacheRead:272000,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
 const model:LanguageModelV4={specificationVersion:'v4',provider:'fixture',modelId:'gpt-5.6-sol',supportedUrls:{},async doGenerate(){throw Error('unused');},async doStream(){events.push('provider');return {stream:new ReadableStream({start(c){c.enqueue({type:'finish',finishReason:{unified:'stop',raw:'stop'},usage});c.close();}})};}};
 const old=process.env.ECOSYSTEM_MAX_REQUEST_CNY;process.env.ECOSYSTEM_MAX_REQUEST_CNY='100';
 try{
 const stream=await runPaidContext({userId:'00000000-0000-4000-8000-000000000001',requestId:'tier-fixture',route:'test',sequence:0,reservedCny:0},()=>withProviderAdmission(model,'gpt-5.6-sol',false,credits,{provider:'relay',model:'gpt-5.6-sol'}).doStream({prompt:[{role:'user',content:[{type:'text',text:'x'.repeat(280000)}]}],maxOutputTokens:10}));
 const reader=stream.stream.getReader();assert.equal((await reader.read()).value?.type,'finish');
 assert.deepEqual(events,['reserve','provider','settle']);assert.equal(amount,1904385);assert.equal((snapshot as {tiers:unknown[]}).tiers.length,2);
 }finally{if(old===undefined)delete process.env.ECOSYSTEM_MAX_REQUEST_CNY;else process.env.ECOSYSTEM_MAX_REQUEST_CNY=old;}
});
