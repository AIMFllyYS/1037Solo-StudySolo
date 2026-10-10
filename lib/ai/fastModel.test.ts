import { test, mockPaidFetch, fixtureLedger } from "@/tests/helpers/paidAiFixture";
import { runPaidContext } from "@/lib/billing/settlement/paidContext";
import { fixtureUser } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { afterEach, } from "node:test";
import { FAST_MODEL_TIMEOUT_MS, callFastModel, fastModelConfig } from "./fastModel.ts";

const KEYS = ["AI_FAST_BASE_URL", "AI_FAST_API_KEY", "AI_FAST_MODEL", "QINIU_BASE_URL", "QINIU_API_KEY"] as const;
const saved = new Map<string, string | undefined>();

test("callFastModel: duplicate admission propagates and never buys a fallback call", async (t) => {
  setEnv({ QINIU_API_KEY: "fixture-only" });
  const provider = mockPaidFetch(t, async () => Response.json({ choices: [{ message: { content: "title" } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  const run = () => runPaidContext({ userId: fixtureUser, requestId: "fixed-title-request", route: "/api/chat-title", sequence: 0, reservedCny: 0 },
    () => callFastModel({ system: "s", user: "u", maxTokens: 8 }));
  assert.ok(await run());
  await assert.rejects(run, error => (error as { status?: number }).status === 409);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(fixtureLedger.seen.size, 1);
});
function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (key in patch) {
      const value = patch[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}
afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

test("fastModelConfig：默认落到七牛云的轻量模型，可被 AI_FAST_* 覆盖", () => {
  setEnv({ QINIU_BASE_URL: "https://api.qnaigc.com/v1", QINIU_API_KEY: "sk-qiniu" });
  const base = fastModelConfig();
  assert.equal(base.enabled, true);
  assert.equal(base.baseUrl, "https://api.qnaigc.com/v1");
  assert.equal(base.model, "doubao-seed-2.0-mini");

  setEnv({
    QINIU_BASE_URL: "https://api.qnaigc.com/v1",
    QINIU_API_KEY: "sk-qiniu",
    AI_FAST_BASE_URL: "https://other.example/v1",
    AI_FAST_API_KEY: "sk-fast",
    AI_FAST_MODEL: "mini-router",
  });
  const overridden = fastModelConfig();
  assert.equal(overridden.baseUrl, "https://other.example/v1");
  assert.equal(overridden.apiKey, "sk-fast");
  assert.equal(overridden.model, "mini-router");
});

test("fastModelConfig：没有 key 时 disabled（调用方必须能优雅回落）", () => {
  setEnv({ QINIU_BASE_URL: "https://api.qnaigc.com/v1", QINIU_API_KEY: undefined });
  assert.equal(fastModelConfig().enabled, false);
});

test("callFastModel：未配置 / 上游非 2xx / 网络异常都返回 null，绝不抛", async (t) => {
  setEnv({ QINIU_API_KEY: undefined });
  assert.equal(await callFastModel({ system: "s", user: "u", maxTokens: 8 }), null);

  setEnv({ QINIU_BASE_URL: "https://api.qnaigc.com/v1", QINIU_API_KEY: "sk" });
  mockPaidFetch(t, async () => new Response("nope", { status: 500 }));
  assert.equal(await callFastModel({ system: "s", user: "u", maxTokens: 8 }), null);

  mockPaidFetch(t, async () => {
    throw new Error("network down");
  });
  assert.equal(await callFastModel({ system: "s", user: "u", maxTokens: 8 }), null);
});

test("callFastModel：请求体是极简结构化调用（关思考 + temperature 0 + 小 max_tokens）", async (t) => {
  setEnv({ QINIU_BASE_URL: "https://api.qnaigc.com/v1", QINIU_API_KEY: "sk-qiniu" });
  let captured: { url: string; body: Record<string, unknown>; auth: string | null } | null = null;
  mockPaidFetch(t, async (url: unknown, init?: RequestInit) => {
    captured = {
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      auth: new Headers(init?.headers).get("authorization"),
    };
    return Response.json({
      choices: [{ message: { content: '{"m":"ds"}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 6, total_tokens: 126 },
    });
  });

  const result = await callFastModel({ system: "sys", user: "usr", maxTokens: 24, json: true });
  assert.ok(result);
  assert.equal(result!.text, '{"m":"ds"}');
  assert.equal(result!.usage?.outputTokens, 6);
  assert.equal(captured!.url, "https://api.qnaigc.com/v1/chat/completions");
  assert.equal(captured!.auth, "Bearer sk-qiniu");
  assert.equal(captured!.body.model, "doubao-seed-2.0-mini");
  assert.equal(captured!.body.temperature, 0);
  assert.equal(captured!.body.max_tokens, 24);
  assert.deepEqual(captured!.body.thinking, { type: "disabled" });
  assert.deepEqual(captured!.body.response_format, { type: "json_object" });
  assert.deepEqual(captured!.body.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "usr" },
  ]);
  assert.ok(FAST_MODEL_TIMEOUT_MS > 0);
});
