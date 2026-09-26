import assert from "node:assert/strict";
import { test } from "node:test";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import { createFailoverLanguageModel, defaultIsRecoverable } from "./failoverModel.ts";
import { CreditAdmissionError } from "@/lib/billing/centralCredits";

const callOptions = { prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }] } as Parameters<LanguageModelV4["doStream"]>[0];

test("failover never bypasses credit admission even after its attempt timer expires", async () => {
  const denied = new MockLanguageModelV4({ doStream: ({ abortSignal }) => new Promise((_, reject) => {
    abortSignal?.addEventListener("abort", () => reject(new CreditAdmissionError("duplicate admission", 409)), { once: true });
  }) });
  let fallbackCalls = 0;
  const backup = new MockLanguageModelV4({ doStream: async () => { fallbackCalls++; return { stream: textStream("must not call") }; } });
  const model = createFailoverLanguageModel([{ model: denied, label: "denied" }, { model: backup, label: "backup" }],
    { firstChunkTimeoutMs: 5, isRecoverable: () => true });
  await assert.rejects(async () => await model.doStream(callOptions), /duplicate admission/);
  assert.equal(fallbackCalls, 0);
});

function apiError(statusCode: number, body = ""): APICallError {
  return new APICallError({
    message: `upstream ${statusCode}`,
    url: "https://x",
    requestBodyValues: {},
    statusCode,
    responseBody: body,
  });
}

function textStream(text: string): ReadableStream<LanguageModelV4StreamPart> {
  return convertArrayToReadableStream<LanguageModelV4StreamPart>([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } } as LanguageModelV4StreamPart,
  ]);
}

function throwingModel(err: unknown): LanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => { throw err; },
    doGenerate: async () => { throw err; },
  });
}

function okModel(text: string): LanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: textStream(text) }),
  });
}

test("defaultIsRecoverable：5xx 与可恢复 400 code 可切换，401/429 不可", () => {
  assert.equal(defaultIsRecoverable(apiError(503)), true);
  assert.equal(defaultIsRecoverable(apiError(400, JSON.stringify({ error: { code: "1211" } }))), true);
  assert.equal(defaultIsRecoverable(apiError(401)), false);
  assert.equal(defaultIsRecoverable(apiError(429)), false);
  assert.equal(defaultIsRecoverable(new Error("random")), false);
});

test("failover：prepareCall 每跳替换冻住的 providerOptions", async () => {
  const seen: unknown[] = [];
  const primary = new MockLanguageModelV4({
    doStream: async (opts) => {
      seen.push({ hop: "primary", providerOptions: opts.providerOptions });
      throw apiError(503);
    },
  });
  const backup = new MockLanguageModelV4({
    doStream: async (opts) => {
      seen.push({ hop: "backup", providerOptions: opts.providerOptions });
      return { stream: textStream("from-backup") };
    },
  });
  const model = createFailoverLanguageModel(
    [
      { model: primary, label: "primary" },
      { model: backup, label: "backup" },
    ],
    {
      prepareCall: (index, opts) => ({
        ...opts,
        providerOptions: { upstream: { hop: index } },
      }),
    },
  );
  const { stream } = await model.doStream({
    ...callOptions,
    providerOptions: { upstream: { hop: "frozen" } },
  });
  await convertReadableStreamToArray(stream);
  assert.deepEqual(seen, [
    { hop: "primary", providerOptions: { upstream: { hop: 0 } } },
    { hop: "backup", providerOptions: { upstream: { hop: 1 } } },
  ]);
});

test("failover：主端点 503 → 切到备用并回调 onFailover / onLanded", async () => {
  const events: string[] = [];
  const landed: string[] = [];
  const model = createFailoverLanguageModel(
    [
      { model: throwingModel(apiError(503)), label: "primary" },
      { model: okModel("from-backup"), label: "backup" },
    ],
    { onFailover: (next) => events.push(next.label), onLanded: (next) => landed.push(next.label) },
  );
  const { stream } = await model.doStream(callOptions);
  const parts = await convertReadableStreamToArray(stream);
  assert.deepEqual(events, ["backup"]);
  assert.deepEqual(landed, ["backup"]);
  assert.ok(parts.some((p) => p.type === "text-delta" && p.delta === "from-backup"));
});

test("failover：不可恢复错误（401）直接抛出，不切换", async () => {
  const model = createFailoverLanguageModel([
    { model: throwingModel(apiError(401)), label: "primary" },
    { model: okModel("nope"), label: "backup" },
  ]);
  await assert.rejects(() => Promise.resolve(model.doStream(callOptions)), (e: unknown) => APICallError.isInstance(e) && e.statusCode === 401);
});

test("failover：首个 chunk 为可恢复 error part 时也切换", async () => {
  const errorFirst = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: "error", error: apiError(502) },
      ]),
    }),
  });
  const model = createFailoverLanguageModel([
    { model: errorFirst, label: "primary" },
    { model: okModel("recovered"), label: "backup" },
  ]);
  const { stream } = await model.doStream(callOptions);
  const parts = await convertReadableStreamToArray(stream);
  assert.ok(parts.some((p) => p.type === "text-delta" && p.delta === "recovered"));
});

test("failover：主端点正常时首个 chunk 被完整回放，顺序不变", async () => {
  const model = createFailoverLanguageModel([
    { model: okModel("primary-ok"), label: "primary" },
    { model: okModel("unused"), label: "backup" },
  ]);
  const { stream } = await model.doStream(callOptions);
  const parts = await convertReadableStreamToArray(stream);
  assert.equal(parts[0].type, "stream-start");
  assert.equal(parts.length, 5);
});

test("failover：链末尾也失败时抛出最后一个错误", async () => {
  const model = createFailoverLanguageModel([
    { model: throwingModel(apiError(503)), label: "a" },
    { model: throwingModel(apiError(504)), label: "b" },
  ]);
  await assert.rejects(() => Promise.resolve(model.doStream(callOptions)), (e: unknown) => APICallError.isInstance(e) && e.statusCode === 504);
});

test("failover：单候选且无超时配置时直接返回原模型", () => {
  const only = okModel("x");
  assert.equal(createFailoverLanguageModel([{ model: only, label: "only" }]), only);
});

test("failover：首字节超时 → 切换到备用；用户主动 abort 不切换", async () => {
  const hang = new MockLanguageModelV4({
    doStream: ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
      }),
  });
  const events: string[] = [];
  const model = createFailoverLanguageModel(
    [
      { model: hang, label: "slow" },
      { model: okModel("fast"), label: "backup" },
    ],
    { firstChunkTimeoutMs: 20, onFailover: (next) => events.push(next.label) },
  );
  const { stream } = await model.doStream(callOptions);
  const parts = await convertReadableStreamToArray(stream);
  assert.deepEqual(events, ["backup"]);
  assert.ok(parts.some((p) => p.type === "text-delta" && p.delta === "fast"));

  // 用户 abort：不得切换
  const userCtrl = new AbortController();
  const model2 = createFailoverLanguageModel(
    [
      { model: hang, label: "slow" },
      { model: okModel("never"), label: "backup" },
    ],
    { firstChunkTimeoutMs: 5000 },
  );
  const pending = model2.doStream({ ...callOptions, abortSignal: userCtrl.signal });
  userCtrl.abort(new DOMException("user", "AbortError"));
  await assert.rejects(() => Promise.resolve(pending), (e: unknown) => e instanceof DOMException && e.name === "AbortError");
});
