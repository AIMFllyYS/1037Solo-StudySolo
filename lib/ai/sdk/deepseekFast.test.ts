import assert from "node:assert/strict";
import { test } from "node:test";
import type { CreditDriver } from "@/lib/billing/settlement/providerAdmission";
import { runPaidContext } from "@/lib/billing/settlement/paidContext";
import { getModelInfo } from "@/lib/ai/models";
import { endpointProvider, tokenTariff, tierPrice } from "@/lib/billing/pricing/tariffs";
import { priceForModel } from "@/lib/billing/settlement/providerAdmission";

const FAST = "deepseek/deepseek-v4.1-flash-fast";

test("official DeepSeek Fast has a single native hop and exactly twice the standard platform price", () => {
  const standard = getModelInfo("deepseek/deepseek-v4.1-flash")!;
  const fast = getModelInfo(FAST)!;
  assert.deepEqual(fast.endpoints, [{ provider: "deepseek", apiModelId: "deepseek-flash" }]);
  assert.equal(endpointProvider("https://api.deepseek.com/v1"), "deepseek");
  const tariff = tokenTariff("deepseek", "deepseek-flash");
  assert.equal(tariff.supplierQuoteVerified, false);
  for (const key of ["input", "cachedInput", "output"] as const) {
    assert.equal(fast.pricing![key], standard.pricing![key] * 2);
    assert.equal(tierPrice(tariff, 1)[key], fast.pricing![key]);
    assert.equal(priceForModel(FAST)[key], fast.pricing![key]);
  }
});

test("native SDK requests keep reasoning/tool history, thinking toggles, official key, and 2x settlement", async (t) => {
  // This file runs in its own node:test process. No real provider or ledger traffic.
  const savedKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "fixture-deepseek-only";
  try {
    const { resolveLanguageModel } = await import("./languageModel");
    const { resolveNextProvider } = await import("@/lib/ai/provider");
    let charged = -1;
    const bodies: Record<string, unknown>[] = [];
    const credits: CreditDriver = {
      async reserve(userId, requestKey, amount, metadata) {
        assert.equal((metadata.priceSnapshot as { provider: string }).provider, "deepseek");
        return { userId, requestKey, reserved: Math.ceil(amount * 1e6), metadata };
      },
      async settleMicro(_admission, amount) { charged = amount; },
      async cancel() {},
    };
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://api.deepseek.com/v1/chat/completions");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-deepseek-only");
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "fixture", object: "chat.completion", created: 1, model: "deepseek-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "answer", reasoning_content: "reason" } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 50 } },
      });
    });
    const resolved = resolveLanguageModel(FAST, undefined, { creditDriver: credits });
    assert.equal(resolved.provider.configured, true);
    assert.equal(resolved.provider.isCustom, false);
    assert.equal(resolveNextProvider(FAST, 0), null);
    const call = () => runPaidContext({ userId: "00000000-0000-4000-8000-000000000001", requestId: crypto.randomUUID(), route: "test", sequence: 0, reservedCny: 0 },
      () => resolved.model.doGenerate({
        prompt: [
          { role: "assistant", content: [
            { type: "reasoning", text: "prior reasoning" },
            { type: "tool-call", toolCallId: "call1", toolName: "lookup", input: {} },
          ] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call1", toolName: "lookup", output: { type: "text", value: "result" } }] },
          { role: "user", content: [{ type: "text", text: "continue" }] },
        ],
        tools: [{ type: "function", name: "lookup", inputSchema: { type: "object", properties: {} } }],
      }));
    resolved.thinkingSettings("medium");
    await call();
    assert.equal(bodies[0].model, "deepseek-flash");
    assert.deepEqual(bodies[0].thinking, { type: "enabled" });
    assert.equal(bodies[0].reasoning_effort, "high");
    assert.equal((bodies[0].messages as { reasoning_content?: string }[])[0].reasoning_content, "prior reasoning");
    // (50 uncached * 4 + 50 cached * .08 + 20 output * 16) microcredits.
    assert.equal(charged, 524);
    resolved.suspendThinking();
    await call();
    assert.deepEqual(bodies[1].thinking, { type: "disabled" });
    assert.equal(bodies[1].reasoning_effort, undefined);
  } finally {
    if (savedKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = savedKey;
  }
});
