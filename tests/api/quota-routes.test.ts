import { test, mockPaidFetch, PaidRequest, fixtureLedger } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { after, afterEach, before, type TestContext } from "node:test";
import type { NextRequest } from "next/server";
import { buildCustomModelRegistryId, CUSTOM_OPENAI_MODEL_ID, type CustomApiGroup } from "@/lib/ai/models";
import { createUserMessage } from "@/lib/chat/messageParts";
import {
  PLATFORM_QUOTA_EXHAUSTED_MESSAGE,
  setQuotaGateTestDeps,
} from "@/lib/billing/quotaGate";

const envNames = [
  "AI_BASE_URL",
  "AI_API_KEY",
  "RELAY_BASE_URL",
  "RELAY_API_KEY",
  "RELAY_MODEL_ID",
  "MIMO_BASE_URL",
  "MIMO_API_KEY",
  "ZHIPU_BASE_URL",
  "ZHIPU_API_KEY",
  "SILICONFLOW_BASE_URL",
  "SILICONFLOW_API_KEY",
] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

let chatPost: typeof import("@/app/api/chat/route")["POST"];
let imagePost: typeof import("@/app/api/image-gen/route")["POST"];
let recordPost: typeof import("@/app/api/record/route")["POST"];

before(async () => {
  process.env.AI_BASE_URL = "https://primary.invalid/v1";
  process.env.AI_API_KEY = "test-only";
  process.env.RELAY_BASE_URL = "https://relay.invalid/v1";
  process.env.RELAY_API_KEY = "relay-test";
  process.env.RELAY_MODEL_ID = "relay-model";
  process.env.MIMO_BASE_URL = "https://backup.invalid/v1";
  process.env.MIMO_API_KEY = "test-only";
  process.env.ZHIPU_BASE_URL = "https://backup.invalid/v1";
  process.env.ZHIPU_API_KEY = "test-only";
  process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
  process.env.SILICONFLOW_API_KEY = "sf-image-key";
  ({ POST: chatPost } = await import("@/app/api/chat/route"));
  ({ POST: imagePost } = await import("@/app/api/image-gen/route"));
  ({ POST: recordPost } = await import("@/app/api/record/route"));
});

after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

afterEach(() => {
  setQuotaGateTestDeps(null);
});

const groups: CustomApiGroup[] = [
  {
    id: "quota",
    name: "Quota",
    baseUrl: "https://custom.invalid/v1",
    apiKey: "user-key",
    models: [{ id: "study-model", thinking: false, tools: true, apiProtocol: "openai" }],
  },
];

function useExhaustedUser() {
  fixtureLedger.available=0;
}

function event(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function openAiStream(text: string): Response {
  const parts = [
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } },
  ];
  return new Response(parts.map(event).join("") + "data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function chatRequest(body: Record<string, unknown>) {
  return new PaidRequest("https://app.invalid/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify({
      messages: [createUserMessage("u1", "解释这一节")],
      ...body,
    }),
  }) as NextRequest;
}

test("platform 池耗尽：内置模型与 custom-openai 被拒，不再提示绕过共享额度", async () => {
  useExhaustedUser();
  const builtin = await chatPost(chatRequest({ modelId: "z-ai/glm-5.3-flash" }));
  assert.equal(builtin.status, 402);
  const builtinBody = (await builtin.json()) as { error: string; code: string };
  assert.equal(builtinBody.code, "quota_exhausted");
  assert.equal(builtinBody.error, PLATFORM_QUOTA_EXHAUSTED_MESSAGE);
  assert.match(builtinBody.error, /生态共享 AI 额度已用完/);

  const relay = await chatPost(chatRequest({ modelId: CUSTOM_OPENAI_MODEL_ID }));
  assert.equal(relay.status, 402);
  const relayBody = (await relay.json()) as { error: string };
  assert.match(relayBody.error, /生态共享 AI 额度已用完/);
});

test("生态额度耗尽：BYOK 服务开销同样拒绝且不调用上游", async (t: TestContext) => {
  useExhaustedUser();
  mockPaidFetch(t, async () =>
    openAiStream("BYOK 仍可用。<FollowUp>如何应用|如何验证</FollowUp>"),
  );
  const res = await chatPost(
    chatRequest({
      modelId: buildCustomModelRegistryId("quota", "study-model"),
      customApiGroups: groups,
    }),
  );
  assert.equal(res.status, 402);
  const text = await res.text();
  assert.match(text, /生态共享 AI 额度已用完/);
  assert.equal(fixtureLedger.events.filter(e=>e==="provider").length,0);
});

test("image-gen 平台模型在额度耗尽时返回可读 402，不是裸 500", async () => {
  useExhaustedUser();
  const res = await imagePost(
    new PaidRequest("https://local.invalid/api/image-gen", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({ modelId: "Tongyi-MAI/Z-Image-Turbo", prompt: "red circle" }),
    }) as NextRequest,
  );
  assert.equal(res.status, 402);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "quota_exhausted");
  assert.match(body.error, /生态共享 AI 额度已用完/);
});

test("record 平台模型耗尽时 SSE error 含生态额度提示", async () => {
  useExhaustedUser();
  const res = await recordPost(
    new PaidRequest("https://local.invalid/api/record", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({
        mode: "excerpt",
        text: "原文",
        modelId: "z-ai/glm-5.3-flash",
      }),
    }) as NextRequest,
  );
  assert.equal(res.status, 402);
  const text = await res.text();
  assert.match(text, /生态共享 AI 额度已用完/);
});


test("canonical identity: anonymous, forged identity header, invalid token and inactive user cannot reach a provider", async (t) => {
  const provider=mockPaidFetch(t,async()=>openAiStream("must not execute"));
  for(const headers of ([{},{"x-studyreview-user-id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"},{authorization:"Bearer forged"}] as Record<string,string>[])){
    const response=await chatPost(new Request("https://app.invalid/api/chat",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify({messages:[createUserMessage("u1","question")]})}) as NextRequest);
    assert.equal(response.status,401);
  }
  fixtureLedger.active=false;
  assert.equal((await chatPost(chatRequest({modelId:"z-ai/glm-5.3-flash"}))).status,401);
  assert.equal(provider.mock.callCount(),0);
  assert.equal(fixtureLedger.events.filter(e=>e==="reserve").length,0);
});

test("central admission rejects insufficient reservation even when preliminary balance is positive", async (t)=>{
  fixtureLedger.available=1;
  const provider=mockPaidFetch(t,async()=>openAiStream("must not execute"));
  const response=await chatPost(chatRequest({modelId:buildCustomModelRegistryId("quota","study-model"),customApiGroups:groups}));
  const text=await response.text();
  assert.match(text,/额度不足/);
  assert.equal(provider.mock.callCount(),0);
  assert.deepEqual(fixtureLedger.events,["reserve"]);
});

test("reusing a completed provider request key never repeats provider invocation or settlement", async(t)=>{
  const provider=mockPaidFetch(t,async()=>openAiStream("answer<FollowUp>应用|验证</FollowUp>"));
  const make=()=>{const req=chatRequest({modelId:buildCustomModelRegistryId("quota","study-model"),customApiGroups:groups});req.headers.set("idempotency-key","same-logical-request");return req;};
  await (await chatPost(make())).text();
  const count=provider.mock.callCount();
  assert.equal(count,1);
  assert.deepEqual(fixtureLedger.events,["reserve","provider","settle"]);
  const again=await (await chatPost(make())).text();
  assert.match(again,/该请求已提交/);
  assert.equal(provider.mock.callCount(),count);
  assert.deepEqual(fixtureLedger.events,["reserve","provider","settle"]);
});
