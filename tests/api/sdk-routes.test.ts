import { test, mockPaidFetch, PaidRequest } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { after, before, type TestContext } from "node:test";
import type { NextRequest } from "next/server";
import { buildCustomModelRegistryId, type CustomApiGroup } from "../../lib/ai/models.ts";
import { buildFallbackSessionTitle } from "../../lib/chat/sessionTitle.ts";
import type { RecordCardAI } from "../../lib/review/types.ts";

// Import the routes only after setting fake environment credentials. No test can
// hit a real provider: every generation test replaces global fetch with a fixture.
const envNames = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL_FLASH", "RELAY_BASE_URL", "RELAY_API_KEY", "SILICONFLOW_BASE_URL", "SILICONFLOW_API_KEY", "AI_TITLE_BASE_URL", "AI_TITLE_API_KEY", "AI_TITLE_MODEL"] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
let record: typeof import("../../app/api/record/route.ts");
let artifact: typeof import("../../app/api/artifact/route.ts");
let title: typeof import("../../app/api/chat-title/route.ts");
let followUps: typeof import("../../app/api/follow-ups/route.ts");
let canvas: typeof import("../../app/api/canvas-revise/route.ts");
let documentRoute: typeof import("../../app/api/document/route.ts");

before(async () => {
  process.env.AI_BASE_URL = "https://builtin.invalid/v1";
  process.env.AI_API_KEY = "builtin-test-key";
  process.env.AI_MODEL_FLASH = "z-ai/glm-5.3-flash";
  process.env.RELAY_BASE_URL = "https://title-priority.invalid/v1";
  process.env.RELAY_API_KEY = "title-priority-key";
  process.env.SILICONFLOW_BASE_URL = "https://title-fallback.invalid/v1";
  process.env.SILICONFLOW_API_KEY = "title-fallback-key";
  process.env.AI_TITLE_MODEL = "title-unknown-model";
  delete process.env.AI_TITLE_BASE_URL;
  delete process.env.AI_TITLE_API_KEY;
  [record, artifact, title, followUps, canvas, documentRoute] = await Promise.all([
    import("../../app/api/record/route.ts"), import("../../app/api/artifact/route.ts"),
    import("../../app/api/chat-title/route.ts"), import("../../app/api/follow-ups/route.ts"),
    import("../../app/api/canvas-revise/route.ts"), import("../../app/api/document/route.ts"),
  ]);
});
after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

const groups: CustomApiGroup[] = [{
  id: "routes", name: "Test routes", baseUrl: "https://custom.invalid/proxy", apiKey: "custom-test-key",
  models: [
    { id: "openai-text", apiProtocol: "openai", thinking: true },
    { id: "anthropic-text", apiProtocol: "anthropic", thinking: true },
    { id: "image-model", type: "image" },
  ],
}];
const config = (id = "openai-text") => ({ modelId: buildCustomModelRegistryId("routes", id), customApiGroups: groups });
const request = (body: unknown, signal?: AbortSignal) => new PaidRequest("https://local.invalid/api/test", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
}) as NextRequest;

interface WireBody {
  model: string;
  stream?: boolean;
  messages: { role: string; content: unknown }[];
  system?: { type: string; text: string }[];
  max_tokens?: number;
  temperature?: number;
  thinking?: { type: string; budget_tokens: number };
  reasoning_effort?: string;
  enable_thinking?: boolean;
  thinking_budget?: number;
  stream_options?: { include_usage: boolean };
}
interface CapturedRequest { url: string; init: RequestInit; body: WireBody }
function upstream(t: TestContext, responder: (call: CapturedRequest) => Response | Promise<Response>) {
  const calls: CapturedRequest[] = [];
  mockPaidFetch(t, async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init, body: JSON.parse(String(init.body)) as WireBody };
    calls.push(call);
    return responder(call);
  });
  return calls;
}
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
function openAiStream(text: string | string[], finish = "stop", reasoning?: string): Response {
  const parts = [
    ...(reasoning ? [{ choices: [{ delta: { reasoning_content: reasoning } }] }] : []),
    ...(Array.isArray(text) ? text : [text]).map((content) => ({ choices: [{ delta: { content } }] })),
    { choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38, prompt_tokens_details: { cached_tokens: 20 } } },
  ];
  return new Response(parts.map(event).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
}
function openAiJson(content: string): Response {
  return Response.json({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
}
function anthropicStream(text: string, reasoning?: string, finish = "end_turn"): Response {
  const index = reasoning ? 1 : 0;
  const parts = [
    { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "anthropic-text", content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    ...(reasoning ? [
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: reasoning } },
      { type: "content_block_stop", index: 0 },
    ] : []),
    { type: "content_block_start", index, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index },
    { type: "message_delta", delta: { stop_reason: finish, stop_sequence: null }, usage: { output_tokens: 8 } },
    { type: "message_stop" },
  ];
  return new Response(parts.map((part) => `event: ${part.type}\n${event(part)}`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}
function anthropicJson(text: string): Response {
  return Response.json({ type: "message", id: "msg_test", role: "assistant", model: "anthropic-text", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 12, output_tokens: 6 } });
}
interface SseEvent {
  type: string;
  status?: string;
  id?: string;
  delta?: string;
  title?: string;
  html?: string;
  message?: string;
  model?: string;
  card?: RecordCardAI;
}
async function events(response: Response): Promise<SseEvent[]> {
  assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
  return (await response.text()).split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)) as SseEvent);
}
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
}

test("record: OpenAI-compatible request, reasoning/content/result/done and cloze parsing stay compatible", async (t) => {
  const calls = upstream(t, () => openAiStream(["===FRONT===\n力是 ____", "\n===BACK===\n作用\n===BLANKS===\n作用 | 力"], "stop", "先找关键词"));
  const res = await record.POST(request({ ...config(), mode: "cloze", text: " 原文 ", userInstruction: " 附加要求 ", subjectName: "物理", categoryName: "课堂", itemLabel: "第一节", enableThinking: true }));
  const data = await events(res);
  assert.deepEqual(data.map((part) => part.type), ["reasoning", "content", "content", "result", "done"]);
  assert.deepEqual(data.at(-2)?.card, { mode: "cloze", cardType: "cloze", front: "力是 ____", back: "作用", blanks: ["作用", "力"] });
  assert.equal(data.at(-2)?.model, config().modelId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://custom.invalid/proxy/v1/chat/completions");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer custom-test-key");
  assert.equal(calls[0].body.reasoning_effort, "medium");
  assert.equal(calls[0].body.enable_thinking, undefined);
  assert.equal(calls[0].body.stream_options?.include_usage, true);
  assert.deepEqual(calls[0].body.messages.map((message) => message.role), ["system", "user"]);
  assert.match(contentText(calls[0].body.messages[0].content), /^你是学习记忆卡片生成器/);
  assert.equal(contentText(calls[0].body.messages[1].content), '当前出处：物理 / 课堂 / 第一节。\n请把下面的原文按要求处理：\n"""\n原文\n"""\n\n用户补充要求：附加要求');
});

test("record: revision context order, original-input truncation and raw-card fallback survive", async (t) => {
  const calls = upstream(t, () => openAiStream(" 没有分隔符的正文 "));
  const data = await events(await record.POST(request({ ...config(), mode: "custom", text: "a".repeat(6005), currentCard: { front: "旧正面", back: "旧背面" }, userInstruction: "精简" })));
  assert.deepEqual(data.at(-2)?.card, { mode: "custom", cardType: "custom", front: "没有分隔符的正文", back: "" });
  const sent = contentText(calls[0].body.messages[1].content);
  assert.match(sent, /a{6000}…（原文过长已截断）/);
  assert.ok(sent.indexOf("原文参考") < sent.indexOf("当前卡片正面"));
  assert.ok(sent.indexOf("旧正面") < sent.indexOf("旧背面"));
  assert.ok(sent.indexOf("旧背面") < sent.indexOf("用户优化要求：精简"));
  assert.match(contentText(calls[0].body.messages[0].content), /^你是学习记忆卡片编辑器/);
});

test("record: Anthropic custom protocol uses Messages API and native thinking while keeping legacy SSE", async (t) => {
  const calls = upstream(t, () => anthropicStream("===FRONT===\n题目\n===BACK===\n答案", "先整理依据"));
  const data = await events(await record.POST(request({ ...config("anthropic-text"), mode: "quiz", text: "材料", enableThinking: true })));
  assert.deepEqual(data.map((part) => part.type), ["reasoning", "content", "result", "done"]);
  assert.equal(data[0].delta, "先整理依据");
  assert.equal(data.at(-2)?.card?.back, "答案");
  assert.equal(calls[0].url, "https://custom.invalid/proxy/v1/messages");
  assert.equal(new Headers(calls[0].init.headers).get("x-api-key"), "custom-test-key");
  assert.deepEqual(calls[0].body.thinking, { type: "enabled", budget_tokens: 8000 });
  assert.ok((calls[0].body.max_tokens ?? 0) > 8000);
  assert.match(calls[0].body.system?.[0].text ?? "", /^你是学习出题助手/);
  assert.deepEqual(calls[0].body.messages.map((message) => message.role), ["user"]);
});

test("record: embedded think tags are not written into card content", async (t) => {
  upstream(t, () => openAiStream(["<think>思考过程</think>", "===FRONT===\n事实\n===BACK===\n提示"]));
  const data = await events(await record.POST(request({ ...config(), mode: "excerpt", text: "材料" })));
  assert.equal(data.filter((part) => part.type === "reasoning").map((part) => part.delta).join(""), "思考过程");
  assert.equal(data.at(-2)?.card?.front, "事实");
});

test("record: invalid inputs never call upstream", async (t) => {
  const calls = upstream(t, () => { throw new Error("unexpected upstream"); });
  for (const [body, message] of [[{ mode: "other", text: "材料" }, "无效的处理模式"], [{ mode: "quiz", text: " " }, "原文为空"]] as const) {
    const res = await record.POST(request(body));
    assert.equal(res.status, 400);
    assert.equal((await events(res))[0].message, message);
  }
  assert.equal(calls.length, 0);
});

test("record: HTTP and in-stream errors retain error/done shape and never emit result", async (t) => {
  let failInStream = false;
  upstream(t, () => failInStream
    ? new Response(event({ error: { message: "stream failed", type: "server_error" } }), { headers: { "Content-Type": "text/event-stream" } })
    : Response.json({ error: { message: "denied" } }, { status: 401 }));
  const first = await events(await record.POST(request({ ...config(), mode: "excerpt", text: "材料" })));
  assert.deepEqual(first.map((part) => part.type), ["error", "done"]);
  assert.match(first[0].message ?? "", /HTTP 401|拒绝认证/);
  assert.doesNotMatch(first[0].message ?? "", /denied|https?:\/\/|sk-|custom-test-key/);
  failInStream = true;
  const second = await events(await record.POST(request({ ...config(), mode: "excerpt", text: "材料" })));
  assert.deepEqual(second.map((part) => part.type), ["error", "done"]);
  assert.match(second[0].message ?? "", /失败|stream failed|取消/);
  assert.doesNotMatch(second[0].message ?? "", /https?:\/\/|sk-/);
});

test("record: abort during generation reaches upstream and does not finalize a card", { timeout: 3000 }, async (t) => {
  const abort = new AbortController();
  let upstreamAborted = false;
  upstream(t, ({ init }) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(event({ choices: [{ delta: { content: "partial" } }] })));
      init.signal?.addEventListener("abort", () => { upstreamAborted = true; controller.error(init.signal?.reason); }, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const res = await record.POST(request({ ...config(), mode: "excerpt", text: "材料" }, abort.signal));
  const reader = res.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /partial/);
  abort.abort(new DOMException("user cancelled", "AbortError"));
  let rest = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    rest += new TextDecoder().decode(part.value);
  }
  assert.equal(upstreamAborted, true);
  assert.doesNotMatch(rest, /"type":"result"/);
  assert.match(rest, /取消/);
});

test("artifact: OpenAI-compatible stream retains event schema, prompt order and HTML fence extraction", async (t) => {
  const html = "<!DOCTYPE html><html><body>你好</body></html>";
  const calls = upstream(t, () => openAiStream(["解释\n```html\n", html, "\n```\n说明"]));
  const data = await events(await artifact.POST(request({ ...config(), id: "art_test", title: "题".repeat(70), prompt: "  概率滑块  " })));
  assert.equal(data[0].status, "start");
  assert.equal(data[0].title, "题".repeat(60));
  assert.equal(data.at(-1)?.status, "done");
  assert.equal(data.at(-1)?.html, html);
  assert.ok(data.every((part) => part.type === "artifact" && part.id === "art_test"));
  assert.equal(calls[0].body.max_tokens, 49152);
  assert.equal(calls[0].body.temperature, 0.4);
  assert.match(contentText(calls[0].body.messages[0].content), /^你是交互式教学演示生成专家/);
  assert.equal(contentText(calls[0].body.messages[1].content), `知识点 / 需求：概率滑块\n标题：${"题".repeat(60)}`);
});

test("artifact: reasoning deltas are forwarded and HTML trapped in reasoning is recovered", async (t) => {
  const html = "<!DOCTYPE html><html><body>图</body></html>";
  upstream(t, () => openAiStream("", "stop", `先规划结构\n${html}`));
  const data = await events(await artifact.POST(request({ ...config(), id: "art_think", title: "演示", prompt: "概率滑块" })));
  assert.equal(data[0].status, "start");
  const reasoning = data.filter((part) => part.status === "reasoning").map((part) => part.delta).join("");
  assert.match(reasoning, /先规划结构/);
  assert.equal(data.at(-1)?.status, "done");
  assert.equal(data.at(-1)?.html, html);
});

test("artifact: length termination repairs truncated HTML for both supported protocols", async (t) => {
  const raw = "<!DOCTYPE html><html><body><script>console.log(1)<scr";
  upstream(t, ({ url }) => url.endsWith("/messages") ? anthropicStream(raw, undefined, "max_tokens") : openAiStream(raw, "length"));
  for (const id of ["openai-text", "anthropic-text"]) {
    const data = await events(await artifact.POST(request({ ...config(id), id: "a", title: "标题", prompt: "需求" })));
    assert.equal(data.at(-1)?.status, "done");
    assert.equal(data.at(-1)?.html, "<!DOCTYPE html><html><body><script>console.log(1)\n</script>\n</body>\n</html>");
  }
});

test("artifact: truncated HTML buried in thinking prose is extracted instead of erroring", async (t) => {
  const raw = "先画坐标轴再写滑块\n```html\n<!DOCTYPE html>\n<html>\n<body><div id='demo'>";
  upstream(t, () => openAiStream("", "length", raw));
  const data = await events(await artifact.POST(request({ ...config(), id: "art_trunc", title: "演示", prompt: "滑块" })));
  assert.equal(data.at(-1)?.status, "done");
  const html = data.at(-1)?.html ?? "";
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(!html.includes("先画坐标轴"));
  assert.ok(html.includes("</body>"));
  assert.ok(html.includes("</html>"));
});

test("artifact: non-html output is an error rather than an empty success", async (t) => {
  upstream(t, () => openAiStream("抱歉，这次只用文字说明"));
  const data = await events(await artifact.POST(request({ ...config(), id: "art_empty", title: "演示", prompt: "需求" })));
  assert.equal(data.at(-1)?.status, "error");
  assert.match(data.at(-1)?.message ?? "", /未输出可渲染的 HTML/);
});

test("artifact: missing id/prompt and image models never request generation", async (t) => {
  const calls = upstream(t, () => { throw new Error("unexpected upstream"); });
  const missingId = await events(await artifact.POST(request({ ...config(), prompt: "需求" })));
  assert.equal(missingId[0].message, "缺少 artifact id");
  const missingPrompt = await events(await artifact.POST(request({ ...config(), id: "a", title: "", prompt: "" })));
  assert.equal(missingPrompt.at(-1)?.message, "缺少演示描述");
  const image = await events(await artifact.POST(request({ ...config("image-model"), id: "a", prompt: "需求" })));
  assert.match(image[0].message ?? "", /生图模型不支持/);
  assert.equal(calls.length, 0);
});

test("artifact: upstream HTTP errors and pre-aborted requests do not emit a successful artifact", async (t) => {
  const calls = upstream(t, () => Response.json({ error: { message: "denied" } }, { status: 403 }));
  const data = await events(await artifact.POST(request({ ...config(), id: "a", prompt: "需求" })));
  assert.deepEqual(data.map((part) => part.status), ["start", "error"]);
  assert.match(data.at(-1)?.message ?? "", /HTTP 403|拒绝认证/);
  assert.doesNotMatch(data.at(-1)?.message ?? "", /denied|https?:\/\/|custom-test-key/);
  const signal = AbortSignal.abort(new DOMException("cancelled", "AbortError"));
  const cancelled = await events(await artifact.POST(request({ ...config(), id: "b", prompt: "需求" }, signal)));
  assert.deepEqual(cancelled.map((part) => part.status), ["start", "error"]);
  assert.equal(calls.length, 1);
});

test("artifact: legacy customProvider credentials still resolve the selected upstream model", async (t) => {
  const calls = upstream(t, () => openAiStream("<html><body>演示</body></html>"));
  const data = await events(await artifact.POST(request({
    id: "legacy", prompt: "需求", modelId: "custom",
    customProvider: { baseUrl: "https://legacy.invalid/v1", apiKey: "legacy-test-key", model: "legacy-text" },
  })));
  assert.equal(data.at(-1)?.status, "done");
  assert.equal(calls[0].url, "https://legacy.invalid/v1/chat/completions");
  assert.equal(calls[0].body.model, "legacy-text");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer legacy-test-key");
});

test("record/artifact: cancelling the downstream response body aborts the provider", { timeout: 3000 }, async (t) => {
  for (const route of [record, artifact]) {
    let markStarted!: () => void;
    let markAborted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
    const fetchMock = mockPaidFetch(t, async (_input: unknown, init: RequestInit) => {
      markStarted();
      return new Response(new ReadableStream({
        start(controller) {
          const cancel = () => { controller.error(init.signal?.reason); markAborted(); };
          if (init.signal?.aborted) cancel();
          else init.signal?.addEventListener("abort", cancel, { once: true });
        },
      }), { headers: { "Content-Type": "text/event-stream" } });
    });
    const res = await route.POST(request({ ...config(), id: "a", prompt: "需求", mode: "excerpt", text: "材料" }));
    await started;
    await res.body!.cancel(new DOMException("consumer stopped", "AbortError"));
    await aborted;
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

test("chat-title: independent credentials/model precedence, input limit and output sanitization stay intact", async (t) => {
  const calls = upstream(t, () => openAiJson('标题：“学习概率的核心思路”\n'));
  const res = await title.POST(request({ content: "长".repeat(2000) }));
  assert.deepEqual(await res.json(), { title: "学习概率的核心思路", generated: true, model: "title-unknown-model" });
  assert.equal(calls[0].url, "https://title-priority.invalid/v1/chat/completions");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer title-priority-key");
  assert.equal(calls[0].body.model, "title-unknown-model");
  assert.equal(calls[0].body.max_tokens, 48);
  assert.equal(calls[0].body.reasoning_effort, "low");
  assert.equal(contentText(calls[0].body.messages[1].content), `请为这次 AI 对话生成标题：\n${"长".repeat(1800)}`);
});

test("chat-title: empty input and upstream failures retain fallback metadata", async (t) => {
  const calls = upstream(t, () => Response.json({ error: { message: "unavailable" } }, { status: 500 }));
  assert.deepEqual(await (await title.POST(request({ content: " " }))).json(), { title: "新对话", generated: false, model: "title-unknown-model" });
  const content = "针对当前页面这段原文：> 条件概率怎么理解";
  assert.deepEqual(await (await title.POST(request({ content }))).json(), { title: buildFallbackSessionTitle(content), generated: false, model: "title-unknown-model" });
  assert.equal(calls.length, 1);
});

test("follow-ups: exact course context + last four messages in order, loose JSON extraction capped at three", async (t) => {
  const calls = upstream(t, () => openAiJson('建议如下：\n["问题一", 2, "问题三", "忽略第四条"]'));
  const messages = Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `message-${index}` }));
  const res = await followUps.POST(request({ messages, subjectId: "probability", categoryId: "detail", itemId: "1.2" }));
  assert.deepEqual(await res.json(), { questions: ["问题一", "2", "问题三"] });
  assert.equal(calls[0].body.model, "z-ai/glm-5.3-flash");
  assert.equal(calls[0].body.temperature, undefined); // Built-in relay uses gateway defaults.
  assert.match(contentText(calls[0].body.messages[0].content), /分类 detail，内容项 1.2/);
  assert.deepEqual(calls[0].body.messages.slice(1, -1).map((message) => contentText(message.content)), ["message-2", "message-3", "message-4", "message-5"]);
  assert.equal(contentText(calls[0].body.messages.at(-1)?.content), "请据此给出 3 个举一反三的追问（仅 JSON 数组）。");
});

test("follow-ups: no history, malformed model output and network errors are non-fatal", async (t) => {
  let networkError = false;
  const calls = upstream(t, () => {
    if (networkError) throw new Error("network unavailable");
    return openAiJson("not an array");
  });
  assert.deepEqual(await (await followUps.POST(request({ messages: [] }))).json(), { questions: [] });
  const body = { messages: [{ role: "user", content: "问题" }] };
  assert.deepEqual(await (await followUps.POST(request(body))).json(), { questions: [] });
  networkError = true;
  assert.deepEqual(await (await followUps.POST(request(body))).json(), { questions: [] });
  assert.equal(calls.length, 2);
});

test("canvas-revise: OpenAI-compatible and Anthropic preserve JSON block/diagnostics + request prompt", async (t) => {
  const revised = { kind: "html", title: "修改结果", source: "<div>修改后</div>" };
  const calls = upstream(t, ({ url }) => url.endsWith("/messages") ? anthropicJson(JSON.stringify(revised)) : openAiJson(JSON.stringify(revised)));
  const block = { kind: "html", source: "<div>修改前</div>" };
  for (const id of ["openai-text", "anthropic-text"]) {
    const res = await canvas.POST(request({ ...config(id), block, instruction: "  加标题  ", topic: "概率" }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.block, revised);
    assert.equal(data.diagnostics[0].ok, true);
    const call = calls.at(-1)!;
    assert.equal(call.body.max_tokens, 6000);
    assert.equal(call.body.temperature, 0.2);
    const sent = JSON.parse(contentText(call.body.messages.at(-1)?.content));
    assert.equal(sent.instruction, "加标题");
    assert.equal(sent.topic, "概率");
    assert.deepEqual(sent.currentBlock, block);
  }
  assert.equal(calls[1].url, "https://custom.invalid/proxy/v1/messages");
});

test("canvas-revise: validation, unparseable output, failed diagnostics and HTTP failures keep response contracts", async (t) => {
  let response = () => openAiJson("unparseable output");
  const calls = upstream(t, () => response());
  const valid = { ...config(), block: { kind: "html", source: "<div>前</div>" }, instruction: "修改" };
  for (const body of [ { ...valid, modelId: "" }, { ...valid, block: null }, { ...valid, instruction: " " }, { ...valid, modelId: "missing-model" }, { ...valid, ...config("image-model") } ]) {
    assert.equal((await canvas.POST(request(body))).status, 400);
  }
  assert.equal(calls.length, 0);
  const malformed = await canvas.POST(request(valid));
  assert.equal(malformed.status, 422);
  const malformedBody = await malformed.json() as { error?: string; rawOutput?: string };
  assert.equal("rawOutput" in malformedBody, false);
  assert.match(malformedBody.error ?? "", /无法解析/);
  response = () => openAiJson(JSON.stringify({ kind: "plot", fn: "not_a_valid_function(x)", attrs: {} }));
  const failed = await canvas.POST(request(valid));
  assert.equal(failed.status, 422);
  const failedBody = await failed.json() as { diagnostics: { ok: boolean }[]; rawOutput?: string };
  assert.equal(failedBody.diagnostics[0].ok, false);
  assert.equal("rawOutput" in failedBody, false);
  response = () => Response.json({
    error: { message: "denied https://evil.example/v1 key=custom-test-key sk-leaked" },
  }, { status: 401 });
  const upstreamFailed = await canvas.POST(request(valid));
  assert.equal(upstreamFailed.status, 502);
  const upstreamBody = await upstreamFailed.json() as { error?: string };
  assert.match(upstreamBody.error ?? "", /HTTP 401|拒绝认证/);
  assert.doesNotMatch(upstreamBody.error ?? "", /denied|evil\.example|custom-test-key|sk-leaked|rawOutput/);
});

test("record/artifact/document: oversized input is 400 Chinese; upstream 500 does not echo body", async (t) => {
  const huge = "x".repeat(32 * 1024 + 1);
  const recordHuge = await events(await record.POST(request({ ...config(), mode: "excerpt", text: huge })));
  assert.match(recordHuge[0].message ?? "", /过长|不合法/);
  assert.doesNotMatch(recordHuge[0].message ?? "", /ZodError|too_big/);

  const artifactHuge = await artifact.POST(request({ ...config(), id: "a", prompt: huge }));
  assert.equal(artifactHuge.status, 400);
  const artifactEvents = await events(artifactHuge);
  assert.match(artifactEvents[0].message ?? "", /过长|不合法/);

  const docHuge = await documentRoute.POST(request({
    ...config(),
    id: "doc-1",
    spec: { title: "t", format: "markdown", genre: "article", brief: "写一节" },
    previousMarkdown: "x".repeat(128 * 1024 + 1),
  }));
  assert.equal(docHuge.status, 400);
  const docEvents = await events(docHuge);
  assert.match(docEvents[0].message ?? "", /过长|不合法/);

  upstream(t, () => Response.json({
    error: { message: "boom https://leak.example/v1 custom-test-key" },
  }, { status: 500 }));
  const recordFail = await events(await record.POST(request({ ...config(), mode: "excerpt", text: "材料" })));
  assert.deepEqual(recordFail.map((part) => part.type), ["error", "done"]);
  assert.doesNotMatch(recordFail[0].message ?? "", /leak\.example|custom-test-key|boom https/);
  assert.match(recordFail[0].message ?? "", /HTTP 500|失败/);

  const docFail = await events(await documentRoute.POST(request({
    ...config(),
    id: "doc-2",
    spec: { title: "t", format: "markdown", genre: "article", brief: "写一节" },
    phase: "outline",
  })));
  const docError = docFail.find((part) => part.status === "error" || part.type === "document");
  assert.ok(docError);
  const docMessage = docFail.find((part) => part.status === "error")?.message ?? "";
  assert.doesNotMatch(docMessage, /leak\.example|custom-test-key/);
});
