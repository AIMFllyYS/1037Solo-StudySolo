import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, announcesToolCall, decideContinuation } from "./completionGuard.ts";

const step = (text: string, finishReason = "stop", toolCalls: unknown[] = []) => ({ text, finishReason, toolCalls });

test("reasoning-only step that hit the output budget gets an answer continuation", () => {
  const d = decideContinuation({ steps: [step("", "length")], toolNames: ["searchNotes"], stepLimit: 6 });
  assert.equal(d?.kind, "answer");
});

test("empty final step after earlier text is not treated as missing answer", () => {
  const d = decideContinuation({ steps: [step("先查资料", "tool-calls", [{}]), step("答案是 42。"), step("")], toolNames: ["x"], stepLimit: 6 });
  assert.equal(d, null);
});

test("announcing a tool without calling it gets a tool continuation", () => {
  assert.equal(announcesToolCall("好的，我来搜索一下相关笔记："), true);
  assert.equal(announcesToolCall("让我调用 createQuiz 为你出几道题。"), true);
  const d = decideContinuation({ steps: [step("好的，我来搜索一下相关笔记：")], toolNames: ["searchNotes"], stepLimit: 6 });
  assert.equal(d?.kind, "tool");
});

test("normal answers, real tool calls, disabled guard and toolless agents do not continue", () => {
  assert.equal(announcesToolCall("导数是瞬时变化率。你可以用 searchNotes 工具查笔记，但这里不需要。"), false);
  assert.equal(decideContinuation({ steps: [step("导数是瞬时变化率。")], toolNames: ["x"], stepLimit: 6 }), null);
  assert.equal(decideContinuation({ steps: [step("我来搜索", "tool-calls", [{}])], toolNames: ["x"], stepLimit: 6 }), null);
  assert.equal(decideContinuation({ steps: [step("我来搜索一下：")], toolNames: [], stepLimit: 6 }), null);
  assert.equal(decideContinuation({ steps: [step("", "length")], toolNames: [], stepLimit: 6, disabled: true }), null);
  assert.equal(decideContinuation({ steps: [step("我来搜索一下：")], toolNames: ["x"], stepLimit: 1 }), null);
});

test("addUsage sums nested numeric usage fields", () => {
  const sum = addUsage(
    { inputTokens: 10, outputTokens: 5, outputTokenDetails: { reasoningTokens: 5 }, raw: { total_tokens: 15 } },
    { inputTokens: 20, outputTokens: 7, outputTokenDetails: { reasoningTokens: 0, textTokens: 7 } },
  );
  assert.deepEqual(sum, { inputTokens: 30, outputTokens: 12, outputTokenDetails: { reasoningTokens: 5, textTokens: 7 }, raw: { total_tokens: 15 } });
  assert.deepEqual(addUsage(undefined, { a: 1 }), { a: 1 });
});
