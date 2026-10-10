import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageModelV4, LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { withProviderAdmission, usageMicrocredits, measuredTokens, priceForModel, boundedCall, type CreditDriver } from "./providerAdmission";
import { runPaidContext } from "./paidContext";

const userId = "00000000-0000-4000-8000-000000000001";
const context = () => ({ userId, requestId: "stable-request", route: "/api/chat", sequence: 0, reservedCny: 0 });
const params = { prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }] }], maxOutputTokens: 100 };
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
function setup() {
  const events: string[] = [];
  let settled = -1;
  const credits: CreditDriver = {
    async reserve(userId,requestKey,maxCny,metadata) { events.push("reserve"); return { userId, requestKey, reserved: Math.ceil(maxCny*1e6), metadata }; },
    async settleMicro(_admission,amount) { events.push("settle"); settled=amount; },
    async cancel() { events.push("cancel"); },
  };
  const model: LanguageModelV4 = {
    specificationVersion:"v4", provider:"test", modelId:"test", supportedUrls:{},
    async doGenerate() { events.push("provider"); return { content: [], finishReason:{unified:"stop",raw:"stop"}, usage, warnings:[] }; },
    async doStream() { events.push("provider"); return { stream: new ReadableStream<LanguageModelV4StreamPart>({start(c){c.enqueue({type:"finish",finishReason:{unified:"stop",raw:"stop"},usage});c.close();}}) }; },
  };
  return { events, credits, model, settled:()=>settled };
}
test("exact pricing rounds once after summation and recognizes cache usage", () => {
  assert.equal(usageMicrocredits({input:1,output:1,cached:0,written:0},{input:0.4,cachedInput:0.4,output:0.4}),1);
  assert.equal(usageMicrocredits({input:10,output:5,cached:3,written:2},{input:2,cachedInput:0.2,cacheWrite:3,output:4}),37);
  assert.equal(measuredTokens({}),null);
  assert.throws(()=>priceForModel("unknown-platform-model"));
});
test("reserve precedes provider and settlement precedes returning content", async () => {
  const s=setup();
  await runPaidContext(context(),()=>withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params));
  assert.deepEqual(s.events,["reserve","provider","settle"]);assert.equal(s.settled(),8);
});
test("denied credit/unknown pricing/missing identity never call the provider", async () => {
  const s=setup();s.credits.reserve=async()=>{throw new Error("insufficient_credits");};
  await assert.rejects(async () => await runPaidContext(context(),()=>withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params)),/insufficient/);
  assert.deepEqual(s.events,[]);
  await assert.rejects(async () => await withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params));
  await assert.rejects(async () => await runPaidContext(context(),()=>withProviderAdmission(s.model,"unknown",false,s.credits).doGenerate(params)));
  assert.deepEqual(s.events,[]);
});
test("known rejection cancels; network or unknown usage keeps reservation for reconciliation", async () => {
  const rejected=setup();rejected.model.doGenerate=async()=>{throw Object.assign(new Error("denied"),{statusCode:400});};
  await assert.rejects(async () => await runPaidContext(context(),()=>withProviderAdmission(rejected.model,"custom",true,rejected.credits).doGenerate(params)));
  assert.deepEqual(rejected.events,["reserve","cancel"]);
  const unknown=setup();unknown.model.doGenerate=async()=>{throw new Error("network timeout");};
  await assert.rejects(async () => await runPaidContext(context(),()=>withProviderAdmission(unknown.model,"custom",true,unknown.credits).doGenerate(params)));
  assert.deepEqual(unknown.events,["reserve"]);
  const missing=setup();missing.model.doGenerate=async()=>({content:[],usage:{},warnings:[]} as unknown as LanguageModelV4GenerateResult);
  // 用量缺失只影响账目：结果照常返回，预留保持占用待核对（不 settle、不 cancel）。
  const kept=await runPaidContext(context(),()=>withProviderAdmission(missing.model,"custom",true,missing.credits).doGenerate(params));
  assert.deepEqual(kept.content,[]);
  assert.deepEqual(missing.events,["reserve"]);
});
test("stream finish settles once; early close without usage still delivers and keeps funds held", async () => {
  const s=setup();
  const result=await runPaidContext(context(),()=>withProviderAdmission(s.model,"custom",true,s.credits).doStream(params));
  const reader=result.stream.getReader();while(!(await reader.read()).done){}
  assert.deepEqual(s.events,["reserve","provider","settle"]);
  const missing=setup();missing.model.doStream=async()=>({stream:new ReadableStream({start(c){c.enqueue({type:"text-delta",id:"t",delta:"partial"});c.close();}})});
  const noUsage=await runPaidContext(context(),()=>withProviderAdmission(missing.model,"custom",true,missing.credits).doStream(params));
  const r=noUsage.stream.getReader();
  assert.equal(((await r.read()).value as {delta?:string}).delta,"partial");
  assert.equal((await r.read()).done,true);
  assert.deepEqual(missing.events,["reserve"]);
});
test("settlement failure at finish does not turn the answer into an error", async () => {
  const s=setup();s.credits.settleMicro=async()=>{throw new Error("ledger unreachable");};
  const result=await runPaidContext(context(),()=>withProviderAdmission(s.model,"custom",true,s.credits).doStream(params));
  const parts:string[]=[];const reader=result.stream.getReader();
  for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value.type);}
  assert.deepEqual(parts,["finish"]);
});
test("per-turn budget counts settled cost, not every step's worst-case reservation", async () => {
  const s=setup();
  let stepCap=0;const reserve=s.credits.reserve;
  s.credits.reserve=async(...args)=>{stepCap=args[2];return reserve(...args);};
  await runPaidContext(context(),()=>withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params));
  assert.ok(stepCap>0);
  // 预算只够 2.5 步的最坏预留：预留不退回的话第 3 步就会被拦下。
  const ctx={...context(),budgetCny:stepCap*2.5};
  await runPaidContext(ctx,async()=>{for(let i=0;i<8;i++)await withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params);});
  assert.equal(s.events.filter(e=>e==="settle").length,9);
  assert.ok(ctx.reservedCny<stepCap);
  // 真正超出预算时仍会拦截，且不触达上游。
  const tight={...context(),budgetCny:stepCap/2};
  await assert.rejects(async()=>await runPaidContext(tight,()=>withProviderAdmission(s.model,"custom",true,s.credits).doGenerate(params)),/预算已达上限/);
});
test("output bound defaults to the declared model maximum and is clamped, never rejected", () => {
  const prompt=[{role:"user" as const,content:[{type:"text" as const,text:"中".repeat(60_000)}]}];
  const bounded=boundedCall({prompt},{contextTokens:128_000,maxOutputTokens:64_000});
  assert.equal(bounded.output,64_000);
  // 18 万字节的中文远小于 128k token 窗口：不再按字节数误判超窗，预留按窗口封顶。
  assert.equal(bounded.input,128_000);
  assert.equal(boundedCall({prompt,maxOutputTokens:999_999},{maxOutputTokens:8_000}).output,131_072);
});
