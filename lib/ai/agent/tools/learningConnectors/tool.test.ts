import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { buildStudyTools, createToolRuntime } from "@/lib/ai/agent/tools/server";
import { createStudyAgent } from "@/lib/ai/agent/studyAgent";
import { createLearningConnectorsTool } from "./tool";
import { writeRecord } from "@/lib/connectors/persistence.server";
import { readConnector } from "@/lib/connectors/service.server";
import { createAgentLifecycleHooks } from "@/lib/ai/observability/agentLog";

const owner = "20000000-0000-4000-8000-000000000001";
const ctx = { subjectId: "probability", categoryId: "detail", itemId: "1.4", skills: [], academicYear: "freshman-2" as const };
test("native tools respect disabled tools, image mode and proposal-free plan/note modes", async () => {
  assert.ok(!buildStudyTools(ctx, createToolRuntime(), { enableSearch: false }).learningConnectors);
  assert.ok(buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, connectorOwner: owner }).learningConnectors);
  assert.ok(!buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, connectorOwner: owner, disabled: ["learningConnectors"] }).learningConnectors);
  const readOnly = createLearningConnectorsTool(owner, [], false);
  const result = await readOnly.execute!({ action: "propose", provider: "todoist", operation: "add-tasks", arguments: {} }, { toolCallId: "fixture", messages: [], context: {} });
  assert.equal((result as { error?: string }).error, "OPERATION_NOT_ALLOWED");
});

test("native SDK lifecycle, server allowlist and real ToolLoopAgent result stream", async t => {
  const before = process.cwd(), directory = mkdtempSync(join(tmpdir(), "studysolo-connector-agent-")), env = process.env as Record<string, string | undefined>;
  const oldNode = env.NODE_ENV, oldKey = env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY;
  process.chdir(directory); env.NODE_ENV = "test"; env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  try {
    await writeRecord(`grant:${owner}:todoist`, { owner, provider: "todoist", accountId: "fixture", accessToken: "private-fixture-access", expiresAt: null, scope: "data:read_write", issuer: "https://todoist.com/", resource: "https://ai.todoist.net/mcp", createdAt: "fixture", callback: "http://localhost:35349/api/connectors/todoist/callback/", defaultWritePolicy: "disabled" });
    const calls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), "https://ai.todoist.net/mcp");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private-fixture-access");
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (init?.method === "GET") return new Response(null, { status: 405 });
      const body = JSON.parse(String(init?.body)); calls.push(body.method);
      if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", serverInfo: { name: "fixture", version: "1" }, capabilities: { tools: {} } } }, { headers: { "Mcp-Session-Id": "fixture-session" } });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "find-tasks", inputSchema: { type: "object", properties: { limit: { type: "integer" } }, additionalProperties: false } }, { name: "new-unreviewed-delete", annotations: { readOnlyHint: true }, inputSchema: { type: "object" } }] } });
      assert.equal(body.params.name, "find-tasks"); assert.deepEqual(body.params.arguments, { limit: 1 });
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "fixture task" }], structuredContent: { tasks: [{ content: "Study fixture" }], privateEcho: "private-fixture-access" } } });
    });
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const step = (parts: LanguageModelV4StreamPart[], reason: "tool-calls" | "stop") => ({ stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([{ type: "stream-start", warnings: [] }, ...parts, { type: "finish", finishReason: { unified: reason, raw: reason }, usage }]) });
    const model = new MockLanguageModelV4({ doStream: [step([{ type: "tool-call", toolCallId: "learning-fixture", toolName: "learningConnectors", input: JSON.stringify({ action: "read", provider: "todoist", operation: "find-tasks", arguments: { limit: 1 } }) }], "tool-calls"), step([{ type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: "已读取学习待办" }, { type: "text-end", id: "answer" }], "stop")] });
    const { agent } = createStudyAgent({ model, chatCtx: { ...ctx, currentTopic: "" }, options: { enableSearch: false, enableThinking: false, contextMode: "full" }, disabledTools: [], skills: [], globalContext: "", referenceContext: "", contextTruncated: false, isImageMode: false, modelSupportsTools: true, thinking: {}, connectorOwner: owner });
    const result = await agent.stream({ messages: [{ role: "user", content: "读取学习任务" }] });
    const chunks = await convertReadableStreamToArray(result.toUIMessageStream());
    assert.ok(chunks.some(chunk => chunk.type === "tool-output-available")); assert.ok(chunks.some(chunk => chunk.type === "text-delta")); assert.ok(calls.includes("tools/call"));
    assert.ok(!JSON.stringify(chunks).includes("private-fixture-access")); assert.ok(!JSON.stringify(model.doStreamCalls).includes(owner)); assert.ok(!JSON.stringify(model.doStreamCalls).includes("private-fixture-access"));
    await assert.rejects(readConnector(owner, "todoist", "new-unreviewed-delete", {}), /OPERATION_UNAVAILABLE/);
  } finally { process.chdir(before); if (oldNode === undefined) delete env.NODE_ENV; else env.NODE_ENV = oldNode; if (oldKey === undefined) delete env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY; else env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY = oldKey; }
});

test("native private content stays out of lifecycle diagnostics", () => {
  const records: unknown[] = [], hooks = createAgentLifecycleHooks({ metadataOnly: true, write: (_hook, data) => records.push(data) });
  hooks.onToolExecutionStart({ toolName: "learningConnectors", toolCallId: "fixture", input: { to: "private-recipient@example.test", body: "private mail body" } });
  hooks.onToolExecutionEnd({ toolName: "learningConnectors", toolCallId: "fixture", output: { text: "private note content" }, toolExecutionMs: 3 });
  const integrations = hooks.telemetry.integrations, integration = Array.isArray(integrations) ? integrations[0] : integrations;
  integration?.onLanguageModelCallEnd?.({ callId: "fixture", prompt: "private prompt", content: "private source", usage: { inputTokens: { total: 3 } } } as never);
  assert.ok(!JSON.stringify(records).includes("private")); assert.ok(JSON.stringify(records).includes("learningConnectors"));
});
