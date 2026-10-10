import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackQuestions, resolveFollowUps } from "./resolveFollowUps.ts";
import type { ChatMessage } from "@/lib/types/chat";

function assistant(text: string, followUpQuestions?: string[]): ChatMessage {
  return {
    id: "a",
    role: "assistant",
    timestamp: 1,
    parts: [{ type: "text", text }],
    followUpQuestions,
  };
}

test("resolveFollowUps：已有追问不覆盖", () => {
  assert.equal(resolveFollowUps(assistant("答案", ["已有"]), "什么是贝叶斯"), undefined);
});

test("resolveFollowUps：无答案不补追问", () => {
  assert.equal(resolveFollowUps(assistant(""), "什么是贝叶斯"), undefined);
});

test("resolveFollowUps：正文 FollowUp 标签优先于兜底", () => {
  const qs = resolveFollowUps(assistant("最终回答。<FollowUp>考点是什么？|再举一例</FollowUp>"), "什么是贝叶斯");
  assert.deepEqual(qs, ["考点是什么？", "再举一例"]);
});

test("resolveFollowUps：无抽取时按用户问题走兜底", () => {
  const qs = resolveFollowUps(assistant("最终回答。"), "什么是贝叶斯");
  assert.deepEqual(qs, fallbackQuestions("什么是贝叶斯"));
  assert.deepEqual(fallbackQuestions("出一道练习题"), ["直接给我答案和解析吧", "这道题的考点是什么？", "再出一道类似的题"]);
  assert.deepEqual(fallbackQuestions("公式推导"), ["每一步的依据是什么？", "有没有更简单的推导方法？", "这个公式怎么记忆？"]);
  assert.deepEqual(fallbackQuestions("比较两者区别"), ["能举个具体例子对比吗？", "它们有什么联系？", "考试容易怎么考？"]);
  assert.deepEqual(fallbackQuestions("继续"), ["能再详细解释一下吗？", "这个知识点考试怎么考？", "给我出一道练习题"]);
});
