import { test, mockPaidFetch } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { type TestContext } from "node:test";
import { buildCustomModelRegistryId, type CustomApiGroup } from "../models.ts";
import { resolveLanguageModel } from "./languageModel.ts";
import { streamRouteText } from "./routeGeneration.ts";

const groups: CustomApiGroup[] = [{
  id: "route-test", name: "Test", baseUrl: "https://route-sdk.invalid/v1", apiKey: "test-key",
  models: [{ id: "text-model", apiProtocol: "openai", thinking: true }],
}];
const encoder = new TextEncoder();
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
  choices: [{ delta, finish_reason }],
});

function model() {
  return resolveLanguageModel(buildCustomModelRegistryId("route-test", "text-model"), groups).model;
}

function mockSse(t: TestContext, parts: unknown[]) {
  mockPaidFetch(t, async () => new Response(parts.map(event).join("") + "data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  }));
}

test("route text stream: real OpenAI-compatible SDK preserves delta order, finish length and cached usage", async (t) => {
  mockSse(t, [
    chunk({ reasoning_content: "先思考" }),
    chunk({ content: "<html>" }),
    chunk({ content: "body" }),
    {
      ...chunk({}, "length"),
      usage: {
        prompt_tokens: 30, completion_tokens: 12, total_tokens: 42,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    },
  ]);
  const deltas: string[] = [];
  const result = await streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 1000,
    onText: (delta) => deltas.push(`text:${delta}`),
    onReasoning: (delta) => deltas.push(`reasoning:${delta}`),
  });
  assert.deepEqual(deltas, ["reasoning:先思考", "text:<html>", "text:body"]);
  assert.equal(result.text, "<html>body");
  assert.equal(result.finishReason, "length");
  assert.equal(result.usage.inputTokens, 30);
  assert.equal(result.usage.inputTokenDetails.cacheReadTokens, 20);
  assert.equal(result.usage.outputTokens, 12);
  assert.equal(result.usage.outputTokenDetails.reasoningTokens, 5);
  assert.equal(result.usage.totalTokens, 42);
});

test("route text stream: provider stream error rejects instead of finalizing a partial answer", async (t) => {
  mockSse(t, [chunk({ content: "partial" }), { error: { message: "upstream exploded", type: "server_error" } }]);
  const deltas: string[] = [];
  await assert.rejects(streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 1000, onText: (delta) => deltas.push(delta),
  }), /upstream exploded/);
  assert.equal(deltas.join(""), "partial");
});

test("route text stream: malformed protocol data rejects", async (t) => {
  mockSse(t, [{ unexpected: "not a provider event" }]);
  await assert.rejects(streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 1000, onText: () => {},
  }));
});

test("route text stream: already-aborted requests do not call upstream", async (t) => {
  const fetchMock = mockPaidFetch(t, async () => { throw new Error("must not call"); });
  const controller = new AbortController();
  controller.abort(new DOMException("user cancelled", "AbortError"));
  await assert.rejects(streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 1000, abortSignal: controller.signal, onText: () => {},
  }), /user cancelled/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("route text stream: idle timeout aborts an upstream body and never returns success", { timeout: 3000 }, async (t) => {
  let aborted = false;
  mockPaidFetch(t, async (_input: unknown, init: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(event(chunk({ content: "partial" }))));
      init.signal?.addEventListener("abort", () => {
        aborted = true;
        controller.error(init.signal?.reason);
      }, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  await assert.rejects(streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 20, onText: () => {},
  }), /timeout|abort/i);
  assert.equal(aborted, true);
});

test("route text stream: an upstream with headers but no first content also times out", { timeout: 3000 }, async (t) => {
  let aborted = false;
  mockPaidFetch(t, async (_input: unknown, init: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init.signal?.addEventListener("abort", () => {
        aborted = true;
        controller.error(init.signal?.reason);
      }, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  await assert.rejects(streamRouteText({
    model: model(), instructions: "system", prompt: "user", temperature: 0.4,
    idleTimeoutMs: 20, onText: () => {},
  }), /timeout|abort/i);
  assert.equal(aborted, true);
});
