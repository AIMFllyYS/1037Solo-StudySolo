import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import dns from "node:dns";
import {
  normalizeAnthropicBaseUrl,
  applyThinkingCallSettings,
  buildThinkingSettings,
  resolveLanguageModel as resolveProductionLanguageModel,
  UPSTREAM_PROVIDER_NAME,
} from "./languageModel.ts";
import type { ResolvedProvider } from "./../provider.ts";
import { buildCustomModelRegistryId, getModelInfo, type CustomApiGroup } from "./../models.ts";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

// All provider HTTP in this suite is intercepted. Do not resolve synthetic
// model hosts through the developer's VPN or a real public DNS server.
beforeEach(t => { (t as TestContext).mock.method(dns.promises, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]); });

import { runPaidContext } from "@/lib/billing/settlement/paidContext";
import type { CreditDriver } from "@/lib/billing/settlement/providerAdmission";
const fixtureCredits: CreditDriver = {
  async reserve(userId,requestKey,amount,metadata){return {userId,requestKey,reserved:Math.ceil(amount*1e6),metadata};},
  async settleMicro(){}, async cancel(){},
};
function resolveLanguageModel(...args: Parameters<typeof resolveProductionLanguageModel>) {
  const result = resolveProductionLanguageModel(args[0],args[1],{...args[2],creditDriver:fixtureCredits});
  const model=result.model;
  const context=()=>({userId:"00000000-0000-4000-8000-000000000001",requestId:crypto.randomUUID(),route:"test",sequence:0,reservedCny:0});
  return {...result,model:{...model,
    doGenerate:(params:Parameters<typeof model.doGenerate>[0])=>runPaidContext(context(),()=>model.doGenerate(params)),
    doStream:(params:Parameters<typeof model.doStream>[0])=>runPaidContext(context(),()=>model.doStream(params)),
  }};
}

function fixtureModel(reasoningField?: string) {
  const groups: CustomApiGroup[] = [{
    id: "fixture", name: "Local fixture", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-only",
    models: [{ id: "fixture-model", apiProtocol: "openai", thinking: true, reasoningField }],
  }];
  return resolveLanguageModel(buildCustomModelRegistryId("fixture", "fixture-model"), groups);
}

const fixturePrompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "你好" }] }];

test("platform-managed custom endpoint uses actual model tariff, not BYOK overhead", async (t) => {
  let charged = -1;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ id: "fixture", object: "chat.completion", created: 1,
      model: "z-ai/glm-5.3-flash", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "标题" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });
  const credits: CreditDriver = { ...fixtureCredits, async settleMicro(_admission, amount) { charged = amount; } };
  const resolved = resolveProductionLanguageModel("custom", {
    baseUrl: "https://api.qnaigc.com/v1", apiKey: "fixture-only", model: "z-ai/glm-5.3-flash",
  }, { platformManagedCredentials: true, creditDriver: credits });
  await runPaidContext({ userId: "00000000-0000-4000-8000-000000000001", requestId: crypto.randomUUID(), route: "test", sequence: 0, reservedCny: 0 },
    () => resolved.model.doGenerate({ prompt: fixturePrompt }));
  assert.equal(calls, 1);
  assert.equal(charged, 22);
});

test("unpriced platform-managed custom endpoint is rejected before provider network", async (t) => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not call"); });
  const resolved = resolveLanguageModel("custom", {
    baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-only", model: "unpriced-server-title",
  }, { platformManagedCredentials: true });
  await assert.rejects(async () => await resolved.model.doGenerate({ prompt: fixturePrompt }), /定价/);
  assert.equal(network.mock.callCount(), 0);
});

test("known model name on an unknown managed endpoint cannot borrow Qiniu pricing",async(t)=>{
  const network=t.mock.method(globalThis,"fetch",async()=>{throw new Error("must not call");});
  const resolved=resolveLanguageModel("custom",{baseUrl:"https://unpriced.invalid/v1",apiKey:"fixture-only",model:"z-ai/glm-5.3-flash"},{platformManagedCredentials:true});
  await assert.rejects(async()=>resolved.model.doGenerate({prompt:fixturePrompt}),/定价/);
  assert.equal(network.mock.callCount(),0);
});

async function readParts(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV4StreamPart[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function fakeProvider(over: Partial<ResolvedProvider>): ResolvedProvider {
  return {
    registryId: "x",
    apiModelId: "x",
    baseUrl: "https://api.example.com/v1",
    apiKey: "k",
    reasoningField: "reasoning_content",
    thinkingRequestStyle: "siliconflow",
    apiProtocol: "openai",
    isCustom: false,
    configured: true,
    endpointIndex: 0,
    timeoutMs: 45_000,
    ...over,
  };
}

test("normalizeAnthropicBaseUrl：有无 /v1 都归一到以 /v1 结尾", () => {
  assert.equal(normalizeAnthropicBaseUrl("https://api.anthropic.com"), "https://api.anthropic.com/v1");
  assert.equal(normalizeAnthropicBaseUrl("https://api.anthropic.com/v1/"), "https://api.anthropic.com/v1");
  assert.equal(normalizeAnthropicBaseUrl("https://proxy.io/anthropic"), "https://proxy.io/anthropic/v1");
});

test("buildThinkingSettings：siliconflow → enable_thinking + thinking_budget", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "siliconflow" }), "high");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { enable_thinking: true, thinking_budget: 16000 } });
  assert.equal(s.maxOutputTokens, undefined);
});

test("buildThinkingSettings：openai-reasoning-effort → reasoningEffort（max 归到 high）", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "openai-reasoning-effort" }), "max");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "high" } });
  const low = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "openai-reasoning-effort" }), "low");
  assert.deepEqual(low.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "low" } });
});

test("buildThinkingSettings：openrouter-reasoning → reasoning.effort", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "openrouter-reasoning" }), "medium");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoning: { effort: "medium" } } });
});

test("buildThinkingSettings：anthropic 原生协议 → providerOptions.anthropic.thinking + 抬高 maxOutputTokens", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "anthropic-thinking", apiProtocol: "anthropic" }), "max");
  assert.deepEqual(s.providerOptions, { anthropic: { thinking: { type: "enabled", budgetTokens: 32000 } } });
  assert.equal(s.maxOutputTokens, 36096);
});

test("buildThinkingSettings：anthropic 风格但走 OpenAI 兼容中转 → 原生字段透传", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "anthropic-thinking", apiProtocol: "openai" }), "low");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled", budget_tokens: 2000 } } });
  assert.equal(s.maxOutputTokens, 16000);
});

test("buildThinkingSettings：none → 空对象", () => {
  assert.deepEqual(buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "none" }), "high"), {});
});

test("resolveLanguageModel：内置模型返回 openai-compatible 模型并暴露能力", () => {
  const r = resolveLanguageModel("mimo-v2.6-pro");
  assert.equal(r.provider.registryId, "mimo-v2.6-pro");
  assert.equal(r.getActualProvider(), r.provider);
  assert.equal(r.supportsThinking, true);
  assert.equal(r.supportsTools, true);
  assert.equal(r.model.modelId, "mimo-v2.6-pro");
  assert.ok(r.thinkingSettings("medium").providerOptions?.[UPSTREAM_PROVIDER_NAME]);
});

test("resolveLanguageModel：自定义 anthropic 分组 → anthropic provider", () => {
  const groups: CustomApiGroup[] = [
    {
      id: "proxy",
      name: "Proxy",
      baseUrl: "https://proxy.io/anthropic",
      apiKey: "sk",
      models: [{ id: "claude-sonnet-4-6", apiProtocol: "anthropic", thinking: true }],
    },
  ];
  const r = resolveLanguageModel(buildCustomModelRegistryId("proxy", "claude-sonnet-4-6"), groups);
  assert.equal(r.provider.apiProtocol, "anthropic");
  assert.match(r.model.provider, /anthropic/);
  assert.equal(r.model.modelId, "claude-sonnet-4-6");
  assert.ok(r.thinkingSettings("medium").providerOptions?.anthropic);
});

test("resolveLanguageModel：不支持思考的模型 thinkingSettings 返回空", () => {
  const r = resolveLanguageModel("Tongyi-MAI/Z-Image-Turbo");
  assert.equal(r.supportsThinking, false);
  assert.deepEqual(r.thinkingSettings("high"), {});
});

test("buildThinkingSettings：GLM-5.3 Flash 的 max 原样下发，medium 降到 low（七牛云只认 low/high/max）", () => {
  const r = resolveLanguageModel("z-ai/glm-5.3-flash");
  const s = r.thinkingSettings("max");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "max" } });
  const med = r.thinkingSettings("medium");
  assert.deepEqual(med.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "low" } });
  const low = r.thinkingSettings("low");
  assert.deepEqual(low.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "low" } });
});

test("buildThinkingSettings：qiniu-toggle 开思考发 thinking.enabled", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "qiniu-toggle" }), "medium");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" } } });
});

test("buildThinkingSettings：Muse Spark 的 high 映射为 xhigh", () => {
  const r = resolveLanguageModel("meta/muse-spark-1.3-contributor");
  const s = r.thinkingSettings("high");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "xhigh" } });
});

test("buildThinkingSettings：gemini-thinking-level → thinking_level", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "gemini-thinking-level" }), "medium");
  assert.deepEqual(s.providerOptions, { [UPSTREAM_PROVIDER_NAME]: { thinking_level: "medium" } });
});

test("buildThinkingSettings：deepseek-thinking → thinking.enabled + reasoning_effort", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "deepseek-thinking" }), "high");
  assert.deepEqual(s.providerOptions, {
    [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" }, reasoning_effort: "high" },
  });
});

test("buildThinkingSettings：mimo-thinking → thinking.type，不含 reasoning_effort", () => {
  const s = buildThinkingSettings(fakeProvider({ thinkingRequestStyle: "mimo-thinking" }), "high");
  const opts = s.providerOptions?.[UPSTREAM_PROVIDER_NAME] as Record<string, unknown>;
  assert.deepEqual(opts, { thinking: { type: "enabled" } });
  assert.equal("reasoning_effort" in opts, false);
  assert.equal("reasoningEffort" in opts, false);
  assert.equal("enable_thinking" in opts, false);
});

test("buildThinkingSettings：GLM 降级到 mimo 后按落地端点 中转 OpenAI 格式下发", () => {
  const stale = fakeProvider({
    registryId: "z-ai/glm-5.3-flash",
    apiModelId: "mimo-v2.6-flash",
    thinkingRequestStyle: "openai-reasoning-effort",
  });
  const landed = getModelInfo(stale.apiModelId);
  assert.equal(landed?.thinkingRequestStyle, "openai-reasoning-effort");
  const s = buildThinkingSettings(
    { ...stale, thinkingRequestStyle: landed!.thinkingRequestStyle! },
    "medium",
    landed,
  );
  const opts = s.providerOptions?.[UPSTREAM_PROVIDER_NAME] as Record<string, unknown>;
  assert.deepEqual(opts, { reasoningEffort: "medium" });
  assert.equal('enable_thinking' in opts, false);
  assert.equal('thinking' in opts, false);
});

test("buildThinkingSettings：自定义模型勾选的 max 档原样下发 reasoningEffort", () => {
  const groups: CustomApiGroup[] = [
    {
      id: "or",
      name: "OpenRouter",
      baseUrl: "https://openrouter.example/v1",
      apiKey: "sk",
      models: [{
        id: "gpt-think",
        thinking: true,
        thinkingLevels: ["low", "medium", "high", "max"],
        apiProtocol: "openai",
      }],
    },
  ];
  const r = resolveLanguageModel(buildCustomModelRegistryId("or", "gpt-think"), groups);
  assert.equal(r.supportsThinking, true);
  assert.deepEqual(r.thinkingSettings("max").providerOptions, {
    [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "max" },
  });
  assert.deepEqual(r.thinkingSettings("low").providerOptions, {
    [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "low" },
  });
});

test("buildThinkingSettings：自定义模型未勾选思考时 thinkingSettings 为空", () => {
  const groups: CustomApiGroup[] = [
    {
      id: "or",
      name: "OpenRouter",
      baseUrl: "https://openrouter.example/v1",
      apiKey: "sk",
      models: [{ id: "gpt-plain", apiProtocol: "openai" }],
    },
  ];
  const r = resolveLanguageModel(buildCustomModelRegistryId("or", "gpt-plain"), groups);
  assert.equal(r.supportsThinking, false);
  assert.deepEqual(r.thinkingSettings("high"), {});
});

test("applyThinkingCallSettings：替换思考键，不残留上一跳 reasoningEffort", () => {
  const next = applyThinkingCallSettings(
    {
      prompt: fixturePrompt,
      providerOptions: {
        [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "max", temperature: 0.6 },
      },
    } as Parameters<typeof applyThinkingCallSettings>[0],
    { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" } } } },
  );
  const opts = next.providerOptions?.[UPSTREAM_PROVIDER_NAME] as Record<string, unknown>;
  assert.deepEqual(opts, { temperature: 0.6, thinking: { type: "enabled" } });
  assert.equal('reasoningEffort' in opts, false);
});

test("resolveLanguageModel：failover 后 thinkingSettings 跟落地 mimo-thinking", async (t) => {
  const primaryId = buildCustomModelRegistryId("glm-like", "glm");
  const backupId = buildCustomModelRegistryId("mimo-like", "mimo-v2.5");
  const groups: CustomApiGroup[] = [
    {
      id: "glm-like",
      name: "GLM-like",
      baseUrl: "https://primary-glm.invalid/v1",
      apiKey: "fixture-only",
      models: [{
        id: "glm",
        thinking: true,
        thinkingLevels: ["low", "high", "max"],
        thinkingRequestStyle: "openai-reasoning-effort",
        apiProtocol: "openai",
      }],
    },
    {
      id: "mimo-like",
      name: "MiMo-like",
      baseUrl: "https://backup-mimo.invalid/v1",
      apiKey: "fixture-only",
      models: [{
        id: "mimo-v2.5",
        thinking: true,
        thinkingRequestStyle: "mimo-thinking",
        apiProtocol: "openai",
      }],
    },
  ];
  const resolved = resolveLanguageModel(primaryId, groups, { fallbackModelIds: [backupId] });
  const frozen = resolved.thinkingSettings("max");
  assert.deepEqual(frozen.providerOptions, {
    [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "max" },
  });
  const hops: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    hops.push({ url, body });
    if (url.includes("primary-glm.invalid")) {
      return new Response(JSON.stringify({error:{message:"not found",code:"model_not_found"}}), { status: 400 });
    }
    return new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n\n` +
        "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = await resolved.model.doStream({
    prompt: fixturePrompt,
    providerOptions: frozen.providerOptions,
  });
  await readParts(result.stream);
  assert.equal(resolved.getActualProvider().registryId, backupId);
  const opts = resolved.thinkingSettings("medium").providerOptions?.[UPSTREAM_PROVIDER_NAME] as Record<string, unknown>;
  assert.deepEqual(opts, { thinking: { type: "enabled" } });
  assert.equal('enable_thinking' in opts, false);

  const backup = hops.find((h) => h.url.includes("backup-mimo.invalid"));
  assert.ok(backup, `backup hop missing: ${JSON.stringify(hops.map((h) => h.url))}`);
  assert.deepEqual(backup.body.thinking, { type: "enabled" }, JSON.stringify(backup.body));
  assert.equal(backup.body.reasoning_effort, undefined);
  assert.equal(backup.body.reasoningEffort, undefined);
  assert.equal(backup.body.enable_thinking, undefined);
});

test("resolveLanguageModel：failover 后 getActualProvider 指向落地模型", async (t) => {
  const primaryId = buildCustomModelRegistryId("failover", "text-a");
  const backupId = buildCustomModelRegistryId("failover-b", "text-b");
  const groups: CustomApiGroup[] = [{
    id: "failover", name: "Failover", baseUrl: "https://primary-failover.invalid/v1", apiKey: "fixture-only",
    models: [
      { id: "text-a", apiProtocol: "openai" },
      { id: "text-b", apiProtocol: "openai" },
    ],
  }];
  const backupGroups: CustomApiGroup[] = [{
    ...groups[0],
    id: "failover-b",
    baseUrl: "https://backup-failover.invalid/v1",
    models: [{ id: "text-b", apiProtocol: "openai" }],
  }];
  const resolved = resolveLanguageModel(primaryId, [...groups, ...backupGroups], {
    fallbackModelIds: [buildCustomModelRegistryId("failover-b", "text-b")],
  });
  assert.equal(resolved.provider.registryId, primaryId);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("primary-failover.invalid")) {
      return new Response(JSON.stringify({error:{message:"not found",code:"model_not_found"}}), { status: 400 });
    }
    return new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n\n` +
        "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = await resolved.model.doStream({ prompt: fixturePrompt });
  await readParts(result.stream);
  assert.equal(resolved.getActualProvider().registryId, backupId);
});

test("resolveLanguageModel：真实 SDK 对默认/标准配置的结构化思考与别名流均可消费", async (t) => {
  for (const field of [undefined, "reasoning", "reasoning_content"]) {
    const resolved = fixtureModel(field);
    const reasoningChunks = [
      { reasoning: { type: "thinking", thinking: "甲" } },
      { reasoning_content: [{ type: "text", text: "乙" }] },
      { reasoning_content: { content: [{ text: "丙" }] }, reasoning: { text: "备用，不重复输出" } },
      { thinking: "丁" },
      { reasoning_details: [{ type: "reasoning.text", text: "戊" }] },
      { reasoning_text: "己" },
    ];
    const events = [
      ...reasoningChunks.map((delta) => ({ choices: [{ delta }] })),
      { choices: [{ delta: { content: "答案" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    ];
    const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://fixture.invalid/v1/chat/completions");
      assert.equal(JSON.parse(String(init?.body)).model, "fixture-model");
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    });
    try {
      const result = await resolved.model.doStream({ prompt: fixturePrompt });
      const parts = await readParts(result.stream);
      assert.deepEqual(parts.filter((part) => part.type === "error"), []);
      assert.equal(parts.filter((part) => part.type === "reasoning-delta").map((part) => part.delta).join(""), "甲乙丙丁戊己");
      assert.equal(parts.filter((part) => part.type === "text-delta").map((part) => part.delta).join(""), "答案");
      const finish = parts.find((part) => part.type === "finish");
      assert.equal(finish?.finishReason.unified, "stop");
      assert.equal(finish?.usage.inputTokens.total, 10);
      assert.equal(finish?.usage.outputTokens.total, 5);
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test("resolveLanguageModel：真实 SDK 非流式标准结构化字段同时规范化且保留文本", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content: "答案", reasoning_content: [{ text: "主思考" }], reasoning: { thinking: "别名" } }, finish_reason: "stop" }],
    usage: { prompt_tokens: 4, completion_tokens: 8 },
  }), { headers: { "content-type": "application/json" } }));
  const result = await fixtureModel("reasoning_content").model.doGenerate({ prompt: fixturePrompt });
  assert.equal(result.content.filter((part) => part.type === "reasoning").map((part) => part.text).join(""), "主思考");
  assert.equal(result.content.filter((part) => part.type === "text").map((part) => part.text).join(""), "答案");
  assert.equal(result.finishReason.unified, "stop");
});

test("resolveLanguageModel：真实 SDK 仍拒绝未知思考结构及畸形工具帧", async (t) => {
  for (const delta of [
    { reasoning: { unexpected: "invalid" }, thinking: "must not mask" },
    { reasoning_content: [{ text: "known" }, { unexpected: "invalid" }], thinking: "must not mask" },
    { tool_calls: [{ index: 0, id: "call_a" }] },
  ]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(
      `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    ));
    try {
      let failure: unknown;
      try {const parts=await readParts((await fixtureModel().model.doStream({prompt:fixturePrompt})).stream);failure=parts.find(p=>p.type==='error')?.error;}catch(error){failure=error;}
      assert.ok(failure instanceof Error);assert.equal(failure.name,'AI_TypeValidationError');
    } finally {
      fetchMock.mock.restore();
    }
  }
});

function anthropicSseResponse() {
  const events = [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "claude-sonnet-4-6", stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: "message_stop" },
  ];
  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function anthropicGroups(): CustomApiGroup[] {
  return [{
    id: "proxy",
    name: "Proxy",
    baseUrl: "https://proxy.io/anthropic",
    apiKey: "sk",
    models: [{ id: "claude-sonnet-4-6", apiProtocol: "anthropic", thinking: true }],
  }];
}

test("resolveLanguageModel：anthropic 协议注入顶层 cache_control（C 项 prompt cache）", async (t) => {
  const resolved = resolveLanguageModel(buildCustomModelRegistryId("proxy", "claude-sonnet-4-6"), anthropicGroups());
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://proxy.io/anthropic/v1/messages");
    bodies.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
    return anthropicSseResponse();
  });
  const result = await resolved.model.doStream({ prompt: fixturePrompt });
  await readParts(result.stream);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].cache_control, { type: "ephemeral" });
});

test("resolveLanguageModel：调用侧显式 cacheControl 时尊重其 ttl", async (t) => {
  const resolved = resolveLanguageModel(buildCustomModelRegistryId("proxy", "claude-sonnet-4-6"), anthropicGroups());
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
    return anthropicSseResponse();
  });
  const result = await resolved.model.doStream({
    prompt: fixturePrompt,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
  });
  await readParts(result.stream);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].cache_control, { type: "ephemeral", ttl: "1h" });
});

test("resolveLanguageModel：真实 SDK 保留上游显式错误与缺失完成信号的失败", async (t) => {
  for (const events of [
    [{ error: { message: "fixture upstream error", type: "server_error", code: "fixture_error" } }],
    [{ choices: [{ delta: { thinking: "尚未完成" } }] }],
  ]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    ));
    try {
      let failure: unknown;
      try {const parts=await readParts((await fixtureModel().model.doStream({prompt:fixturePrompt})).stream);failure=parts.find(p=>p.type==='error')?.error;}catch(error){failure=error;}
      assert.ok(failure);
    } finally {
      fetchMock.mock.restore();
    }
  }
});
