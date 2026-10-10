import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMessageText,
  getAnswerText,
  getReasoningText,
  getToolParts,
  getToolPartsByName,
  hasVisibleContent,
  isLegacyMessage,
  migrateLegacyMessage,
  normalizeStoredMessages,
  createUserMessage,
  createAssistantPlaceholder,
  withAnswerText,
  type LegacyChatMessage,
} from "./messageParts.ts";
import type { ChatMessage } from "@/lib/types/chat";

const rich: ChatMessage = {
  id: "a1",
  role: "assistant",
  timestamp: 1,
  parts: [
    { type: "reasoning", text: "先想想", state: "done" },
    { type: "text", text: "我先查一下教材。", state: "done" },
    { type: "tool-searchNotes", toolCallId: "c1", state: "output-available", input: { query: "贝叶斯" }, output: { text: "…", hits: [{ title: "1.4", path: "probability/detail/1.4", snippet: "s" }] } },
    { type: "step-start" },
    { type: "tool-getSection", toolCallId: "c2", state: "output-available", input: { path: "probability/detail/1.4" }, output: { text: "全文", found: true } },
    { type: "step-start" },
    { type: "text", text: "最终回答。", state: "done" },
  ],
};

test("getMessageText 拼接全部 text；有 step-start 时 getAnswerText 保留中间正文", () => {
  assert.equal(getMessageText(rich), "我先查一下教材。\n\n最终回答。");
  assert.equal(getAnswerText(rich), "我先查一下教材。\n\n最终回答。");
  assert.equal(getReasoningText(rich), "先想想");
});

test("getAnswerText：无工具时等于全部正文", () => {
  const m = createUserMessage("u", "hello");
  assert.equal(getAnswerText(m), "hello");
});

test("getAnswerText 与 buildTrace 一样剥 think 标签", () => {
  const withThink = { parts: [{ type: "text" as const, text: "<think>兼容端点的思考</think>回答", state: "done" as const }] };
  assert.equal(getAnswerText(withThink), "回答");
  const noStep = {
    parts: [
      { type: "text" as const, text: "<think>过程</think>中间讲解", state: "done" as const },
      { type: "tool-searchNotes" as const, toolCallId: "c1", state: "output-available" as const, input: { query: "q" }, output: { text: "", hits: [] } },
      { type: "text" as const, text: "<think>收尾思考</think>最终回答", state: "done" as const },
    ],
  };
  assert.equal(getAnswerText(noStep), "最终回答");
});

test("withAnswerText：时间线消息改写全部答案段且不丢工具", () => {
  const parts = withAnswerText(rich, "修订后的正文");
  assert.deepEqual(parts.map((p) => p.type), [
    "reasoning",
    "tool-searchNotes",
    "step-start",
    "tool-getSection",
    "step-start",
    "text",
  ]);
  const text = parts.find((p) => p.type === "text");
  assert.equal(text?.type === "text" && text.text, "修订后的正文");
  assert.equal(parts.filter((p) => p.type === "text").length, 1);
});

test("withAnswerText：无 step-start 仍只替换最后工具之后的正文", () => {
  const msg = {
    parts: [
      { type: "text" as const, text: "中间讲解", state: "done" as const },
      { type: "tool-searchNotes" as const, toolCallId: "c1", state: "output-available" as const, input: { query: "q" }, output: { text: "", hits: [] } },
      { type: "text" as const, text: "最终回答", state: "done" as const },
    ],
  };
  const parts = withAnswerText(msg, "新答案");
  assert.equal(parts[0].type === "text" && parts[0].text, "中间讲解");
  const tail = parts.at(-1);
  assert.equal(tail?.type === "text" && tail.text, "新答案");
  assert.equal(parts.filter((p) => p.type === "text").length, 2);
});

test("getToolParts / getToolPartsByName", () => {
  assert.equal(getToolParts(rich).length, 2);
  const sn = getToolPartsByName(rich, "searchNotes");
  assert.equal(sn.length, 1);
  assert.equal(sn[0].state === "output-available" && sn[0].output.hits.length, 1);
});

test("hasVisibleContent：空占位 false，只有工具 true，只有空白文本 false", () => {
  assert.equal(hasVisibleContent(createAssistantPlaceholder("x", {})), false);
  assert.equal(hasVisibleContent({ parts: [{ type: "text", text: "  " }] }), false);
  assert.equal(hasVisibleContent({ parts: [{ type: "tool-getOutline", toolCallId: "c", state: "input-available", input: {} }] }), true);
});

test("isLegacyMessage：旧 content 字符串且无 parts", () => {
  assert.equal(isLegacyMessage({ id: "1", role: "user", content: "hi", timestamp: 1 }), true);
  assert.equal(isLegacyMessage(rich), false);
  assert.equal(isLegacyMessage(null), false);
});

test("migrateLegacyMessage：思考 → 工具 → 正文，附带字段迁到 output", () => {
  const legacy: LegacyChatMessage = {
    id: "l1",
    role: "assistant",
    timestamp: 5,
    content: "<think>内嵌思考</think>正文回答",
    reasoningContent: "字段思考",
    followUpQuestions: ["q1"],
    metadata: { thinkingEnabled: true },
    toolCalls: [
      { id: "t1", name: "webSearch", arguments: { query: "x" }, status: "success", sources: [{ title: "a", url: "https://a", snippet: "" }], cacheHit: true },
      { id: "t2", name: "renderInteractive", arguments: { title: "演示", prompt: "p" }, status: "success", artifactId: "art_t2", artifactModelId: "mimo-v2.5" },
      { id: "t3", name: "generateImage", arguments: {}, status: "success", imageGenId: "img_t3", imageGenPrompt: "pp", imageGenTitle: "tt", imageGenSize: "960x1280", imageGenCount: 2, imageModelId: "Tongyi-MAI/Z-Image-Turbo" },
      { id: "t4", name: "getSection", argumentsStr: "{\"path\":\"a/b/c\"}", status: "running" },
    ],
  };
  const m = migrateLegacyMessage(legacy);
  assert.equal(m.role, "assistant");
  assert.equal(m.timestamp, 5);
  assert.deepEqual(m.followUpQuestions, ["q1"]);
  assert.deepEqual(m.metadata, { thinkingEnabled: true });

  const types = m.parts.map((p) => p.type);
  assert.deepEqual(types, ["reasoning", "tool-webSearch", "tool-renderInteractive", "tool-generateImage", "tool-getSection", "step-start", "text"]);
  assert.equal(getReasoningText(m), "字段思考\n\n内嵌思考");
  assert.equal(getAnswerText(m), "正文回答");

  const ws = getToolPartsByName(m, "webSearch")[0];
  assert.equal(ws.state, "output-available");
  assert.equal(ws.state === "output-available" && ws.output.cacheHit, true);
  assert.equal(ws.state === "output-available" && ws.output.sources.length, 1);

  const ri = getToolPartsByName(m, "renderInteractive")[0];
  assert.ok(ri.state === "output-available");
  assert.equal(ri.output.artifactId, "art_t2");
  assert.equal(ri.output.title, "演示");
  assert.equal(ri.output.modelId, "mimo-v2.5");

  const gi = getToolPartsByName(m, "generateImage")[0];
  assert.ok(gi.state === "output-available");
  assert.equal(gi.output.imageGenId, "img_t3");
  assert.equal(gi.output.count, 2);
  assert.equal(gi.output.modelId, "Tongyi-MAI/Z-Image-Turbo");

  const gs = getToolPartsByName(m, "getSection")[0];
  assert.equal(gs.state, "output-error");
  assert.deepEqual(gs.input, { path: "a/b/c" });
});

test("migrateLegacyMessage：纯文本 user 消息不产生 step-start", () => {
  const m = migrateLegacyMessage({ id: "u", role: "user", content: "问题", timestamp: 1, attachments: [{ type: "image", mimeType: "image/png", id: "blob-1" }] });
  assert.deepEqual(m.parts, [{ type: "text", text: "问题", state: "done" }]);
  assert.equal(m.attachments?.length, 1);
});

test("normalizeStoredMessages：新旧混合数组统一", () => {
  const out = normalizeStoredMessages([
    { id: "1", role: "user", content: "old", timestamp: 1 },
    rich,
  ]);
  assert.equal(out.length, 2);
  assert.equal(getMessageText(out[0]), "old");
  assert.equal(out[1], rich);
});
