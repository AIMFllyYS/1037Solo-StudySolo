import { test } from "node:test";
import assert from "node:assert/strict";
import { callKitSolo } from "@/lib/plugins/kitsolo-rpc";
import { buildStudyTools, createToolRuntime } from "@/lib/ai/agent/tools/server";
import { createStudyAgent } from "@/lib/ai/agent/studyAgent";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

test("KitSolo completes MCP lifecycle and passes only a scoped credential", async (t) => {
  const calls: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "http://localhost:3038/mcp/");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer scoped-kit-token");
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25" } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    assert.deepEqual(body.params, { name: "kitsolo_json", arguments: { text: "{}", operation: "format" } });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: '{"output":"{}"}' }], structuredContent: { output: "{}" } } });
  });
  const result = await callKitSolo("http://localhost:3038", "scoped-kit-token", { action: "call", name: "kitsolo_json", arguments: { text: "{}", operation: "format" } });
  assert.equal(result.data?.output, "{}"); assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(result).includes("scoped-kit-token"));
});

test("MCP failures and cancellation have useful feedback without leaking response bodies", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("secret", { status: 401 }));
  const denied = await callKitSolo("http://localhost:3038", "scoped-token", { action: "search" });
  assert.equal(denied.error, "http_401"); assert.ok(!denied.text.includes("secret"));
  assert.equal((await callKitSolo("http://localhost:3038", "scoped-token", { action: "call", name: "../../bad" })).error, "invalid_name");
});

test("only associated main Agent turns expose KitSolo; user disable and note windows win", () => {
  const ctx = { subjectId: "probability", categoryId: "detail", itemId: "1.4", skills: [], academicYear: "freshman-2" as const };
  assert.equal("kitSolo" in buildStudyTools(ctx, createToolRuntime(), { enableSearch: false }), false);
  assert.equal("kitSolo" in buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, kitSoloAccessToken: "scoped-token" }), true);
  assert.equal("kitSolo" in buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, kitSoloAccessToken: "scoped-token", disabled: ["kitSolo"] }), false);
  assert.equal("kitSolo" in buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, kitSoloAccessToken: "scoped-token", noteWindowAgent: true }), false);
});

test("a linked Agent emits KitSolo tool feedback into the existing message stream", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25" } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: '{"output":"{}"}' }], structuredContent: { output: "{}", display: { title: "JSON", url: "https://kitsolo.1037solo.com/tools/json/" } } } });
  });
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const step = (parts: LanguageModelV4StreamPart[], reason: "tool-calls" | "stop") => ({ stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([{ type: "stream-start", warnings: [] }, ...parts, { type: "finish", finishReason: { unified: reason, raw: reason }, usage }]) });
  const model = new MockLanguageModelV4({ doStream: [
    step([{ type: "tool-call", toolCallId: "kit-call", toolName: "kitSolo", input: JSON.stringify({ action: "call", name: "kitsolo_json", arguments: { text: "{}", operation: "format" } }) }], "tool-calls"),
    step([{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "处理完成" }, { type: "text-end", id: "t" }], "stop"),
  ] });
  const { agent } = createStudyAgent({ model, chatCtx: { subjectId: "probability", categoryId: "detail", itemId: "1.4", currentTopic: "", academicYear: "freshman-2" }, options: { enableSearch: false, enableThinking: false, contextMode: "full" }, disabledTools: [], skills: [], globalContext: "", referenceContext: "", contextTruncated: false, isImageMode: false, modelSupportsTools: true, thinking: {}, userId: "owner", kitSoloAccessToken: "private-scoped-token" });
  const result = await agent.stream({ messages: [{ role: "user", content: "整理 JSON" }] });
  const chunks = await convertReadableStreamToArray(result.toUIMessageStream());
  const output = chunks.find(part => part.type === "tool-output-available") as { output?: { data?: { output?: string } } };
  assert.equal(output?.output?.data?.output, "{}");
  assert.ok(chunks.some(part => part.type === "text-delta"));
  assert.ok(!JSON.stringify(chunks).includes("private-scoped-token"));
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("private-scoped-token"));
});
