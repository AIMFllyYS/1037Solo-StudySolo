import assert from "node:assert/strict";
import { test } from "node:test";
import { collectSessionProducts } from "./sessionProducts.ts";
import type { ChatMessage, ChatMessagePart } from "@/lib/types/chat";

function assistant(id: string, parts: ChatMessagePart[]): ChatMessage {
  return { id, role: "assistant", timestamp: 1, parts };
}

test("collectSessionProducts：出题 / 演示 / 文档按消息顺序收集，同 id 去重", () => {
  const questions = [{
    id: "q1",
    type: "single_choice" as const,
    difficulty: "basic" as const,
    source: "current_chapter" as const,
    points: 2,
    stem: "第一题",
    options: ["甲", "乙"],
    answer: 0,
  }];
  const items = collectSessionProducts([
    assistant("m1", [
      {
        type: "tool-createQuiz",
        toolCallId: "c1",
        state: "output-available",
        input: { title: "即时检验", questions: [] },
        output: {
          text: "…",
          quizId: "quiz_1",
          title: "即时检验",
          intent: "check",
          droppedCount: 0,
          questions,
        },
      },
      {
        type: "tool-renderInteractive",
        toolCallId: "r1",
        state: "output-available",
        input: { title: "概率滑块", prompt: "拖动看分布" },
        output: { text: "…", artifactId: "art_1", title: "概率滑块", prompt: "拖动看分布" },
      },
    ]),
    assistant("m2", [
      {
        type: "tool-createQuiz",
        toolCallId: "c1-dup",
        state: "output-available",
        input: { title: "即时检验", questions: [] },
        output: {
          text: "…",
          quizId: "quiz_1",
          title: "即时检验（重复）",
          intent: "check",
          droppedCount: 0,
          questions,
        },
      },
      {
        type: "tool-writeDocument",
        toolCallId: "d1",
        state: "output-available",
        input: { title: "细胞综述", format: "markdown", genre: "review-notes", brief: "写一篇" },
        output: {
          text: "…",
          documentId: "doc_1",
          spec: { title: "细胞综述", format: "markdown", genre: "review-notes", brief: "写一篇" },
        },
      },
    ]),
  ]);

  assert.deepEqual(items.map((item) => `${item.kind}:${item.id}`), [
    "quiz:quiz_1",
    "interactive:art_1",
    "document:doc_1",
  ]);
  assert.equal(items[0]?.title, "即时检验");
  assert.equal(items[0]?.kind === "quiz" && items[0].payload.questions.length, 1);
  assert.equal(items[1]?.title, "概率滑块");
  assert.equal(items[2]?.title, "细胞综述");
});

test("collectSessionProducts：空对话与半成品不算产物", () => {
  assert.equal(collectSessionProducts([]).length, 0);
  assert.equal(
    collectSessionProducts([
      assistant("m", [
        {
          type: "tool-createQuiz",
          toolCallId: "c",
          state: "output-available",
          input: { title: "空", questions: [] },
          output: { text: "…", quizId: "quiz_x", title: "空", intent: "check", droppedCount: 0, questions: [] },
        },
        {
          type: "tool-renderInteractive",
          toolCallId: "r",
          state: "input-available",
          input: { title: "未完成", prompt: "p" },
        },
      ]),
    ]).length,
    0,
  );
});
