import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage, ChatMessagePart } from "@/lib/types/chat";
import {
  COMPACTED_TEXT_PREFIX,
  compactStudyMessage,
  compactStudyMessages,
  compactStudyParts,
  isCompactedToolText,
  stubToolText,
} from "./compactStudyParts.ts";

const pageText = "【细胞生物学 > 教材 > 第一章】\n\n" + "线粒体是细胞的能量工厂。".repeat(40);

test("cloud logs stay bounded while protocol IDs and completed outcome survive history compaction", () => {
  const output = { sessionId: "fixture-session", commandId: "fixture-command", conversationId: "fixture-conversation", state: "completed", exitCode: 0, stdout: "start:" + "x".repeat(200000) + ":end", stderr: "", text: "x".repeat(200000), artifact: { id: "fixture-artifact", filename: "answer.pdf", downloadUrl: "/api/agent/sandbox/artifacts/fixture" } };
  for (const mode of ["persist", "sync", "ui-request"] as const) {
    const parts = compactStudyParts([toolPart("cloudSandbox", output)], mode);
    const actual = (parts[0] as unknown as { output: typeof output & { logsTruncated: boolean } }).output;
    assert.equal(actual.sessionId, output.sessionId); assert.equal(actual.commandId, output.commandId); assert.equal(actual.exitCode, 0);
    assert.equal(actual.artifact.id, "fixture-artifact"); assert.ok(actual.stdout.startsWith("start:")); assert.ok(actual.stdout.endsWith(":end"));
    assert.equal(actual.logsTruncated, true); assert.ok(JSON.stringify(actual).length < 20000);
  }
});

function toolPart(name: string, output: Record<string, unknown>, input: Record<string, unknown> = {}): ChatMessagePart {
  return {
    type: `tool-${name}`,
    toolCallId: `c-${name}`,
    state: "output-available",
    input,
    output,
  } as unknown as ChatMessagePart;
}

test("compactStudyParts persist：页/节/技能/大纲/演示只留 stub，卡片字段仍在", () => {
  const parts = compactStudyParts([
    { type: "reasoning", text: "这是一段很长的思考过程，用来验证预览截断是否保留折叠标题所需的字数。".repeat(3), state: "done" },
    toolPart("getCurrentPage", { text: pageText, contextKey: "page:cell/textbook/ch1" }),
    toolPart("getSection", { text: pageText, contextKey: "section:cell/textbook/ch1", title: "第一章", found: true }),
    toolPart("useSkill", { text: "【技能：Bayes】\n很长的技能正文".repeat(20), contextKey: "skill:s1", skill: "Bayes", found: true }),
    toolPart("getOutline", { text: "=== 很长的目录 ===".repeat(30), contextKey: "outline:freshman-2" }),
    toolPart("getArtifact", { text: "<html>演示全文</html>", artifactId: "art_1", title: "滑块", found: true, html: "<html>演示全文</html>" }),
    toolPart("searchNotes", { text: "重复的检索正文", contextKey: "search:q", hits: [{ title: "页", path: "a/b/c", snippet: "片段" }] }),
    toolPart("createQuiz", {
      text: "题面说明".repeat(80),
      questions: [{ stem: "线粒体的功能？", options: ["A", "B"], answer: "A" }],
    }),
    { type: "step-start" },
    { type: "text", text: "线粒体负责供能。", state: "done" },
  ], "persist");

  const reasoning = parts.find((p) => p.type === "reasoning") as { text: string };
  assert.ok(reasoning.text.length <= 110);
  assert.ok(reasoning.text.includes("思考"));

  const page = parts.find((p) => p.type === "tool-getCurrentPage") as { output: { text: string; contextKey: string } };
  assert.ok(isCompactedToolText(page.output.text));
  assert.equal(page.output.contextKey, "page:cell/textbook/ch1");
  assert.doesNotMatch(page.output.text, /线粒体是细胞的能量工厂/);

  const quiz = parts.find((p) => p.type === "tool-createQuiz") as { output: { questions: unknown[]; text: string } };
  assert.ok(Array.isArray(quiz.output.questions));
  assert.equal((quiz.output.questions[0] as { stem: string }).stem, "线粒体的功能？");

  const search = parts.find((p) => p.type === "tool-searchNotes") as { output: { hits: unknown[]; text: string; diagnostics?: unknown } };
  assert.equal(search.output.hits.length, 1);
  assert.equal("diagnostics" in search.output, false);
  assert.ok(search.output.text.startsWith(COMPACTED_TEXT_PREFIX));

  const answer = parts.find((p) => p.type === "text") as { text: string };
  assert.equal(answer.text, "线粒体负责供能。");
  assert.ok(parts.some((p) => p.type === "step-start"));

  const artifact = parts.find((p) => p.type === "tool-getArtifact") as unknown as { output: Record<string, unknown> };
  assert.equal(artifact.output.artifactId, "art_1");
  assert.equal("html" in artifact.output, false);
});

test("compactStudyParts ui-request：剥 reasoning，工具走 stub", () => {
  const parts = compactStudyParts([
    { type: "reasoning", text: "思考全文", state: "done" },
    { type: "step-start" },
    toolPart("getSection", { text: pageText, contextKey: "section:a/b/c", title: "节", found: true }),
    { type: "text", text: "回答", state: "done" },
  ], "ui-request");
  assert.equal(parts.some((p) => p.type === "reasoning"), false);
  assert.equal(parts.some((p) => p.type === "step-start"), false);
  const section = parts.find((p) => p.type === "tool-getSection") as { output: { text: string } };
  assert.ok(isCompactedToolText(section.output.text));
  assert.equal((parts.find((p) => p.type === "text") as { text: string }).text, "回答");
});

test("compactStudyParts：流式思考不截断，已压缩文本不再二次改写", () => {
  const streaming = compactStudyParts([
    { type: "reasoning", text: "还在想".repeat(80), state: "streaming" },
  ], "persist");
  assert.equal((streaming[0] as { text: string }).text.length > 110, true);

  const stub = stubToolText("getCurrentPage", { text: pageText, contextKey: "page:x" });
  const again = compactStudyParts([
    toolPart("getCurrentPage", { text: stub, contextKey: "page:x" }),
  ], "sync");
  assert.equal((again[0] as { output: { text: string } }).output.text, stub);
});

test("compactStudyMessages：renderInteractive 完成后丢掉 prompt", () => {
  const [message] = compactStudyMessages([{
    id: "m1",
    role: "assistant",
    timestamp: 1,
    parts: [toolPart("renderInteractive", {
      text: "开始生成",
      artifactId: "art_c1",
      title: "滑块",
      prompt: "很长的生成提示词".repeat(10),
    }, { title: "滑块", prompt: "很长的生成提示词".repeat(10) })],
  }], "persist");
  const part = message.parts[0] as { output: Record<string, unknown>; input: Record<string, unknown> };
  assert.equal(part.output.artifactId, "art_c1");
  assert.equal("prompt" in part.output, false);
  assert.equal("prompt" in part.input, false);
});

test("compactStudyMessage 保持回答与附件 ref", () => {
  const message: ChatMessage = {
    id: "u1",
    role: "user",
    timestamp: 1,
    parts: [{ type: "text", text: "看看这张图", state: "done" }],
    attachments: [{ type: "image", mimeType: "image/png", id: "blob-1", name: "a.png" }],
  };
  const out = compactStudyMessage(message, "sync");
  assert.equal(out.attachments?.[0] && "id" in out.attachments[0] ? out.attachments[0].id : "", "blob-1");
  assert.equal((out.parts[0] as { text: string }).text, "看看这张图");
});
