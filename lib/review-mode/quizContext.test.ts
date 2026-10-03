import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGroundedReviewPrompt, estimateReviewTokens, formatQuestionContext, selectWithinBudget } from "./quizContext.ts";
import type { ReviewQuestionContext } from "./quizContext.ts";
import type { QuizQuestion } from "@/lib/quiz/types";

const question = (id: string, stem: string): QuizQuestion => ({
  id, type: "single_choice", difficulty: "basic", source: "current_chapter", points: 1,
  stem, options: ["A", "B"], answer: 1, explanation: "解析", sourceRef: { path: "content/example.md" },
});

test("wrong-question context retains the real original stem/options/answer and source reference", () => {
  const formatted = formatQuestionContext({
    key: "ssq-v1:test:q1", title: "化学 · 氧化还原", quizId: "quiz-1", question: question("q1", "氧化数如何变化？"),
    misses: 2, latestAttemptAt: "2026-10-04T00:00:00.000Z",
  });
  assert.match(formatted, /氧化数如何变化/);
  assert.match(formatted, /referenceAnswer/);
  assert.match(formatted, /content\/example\.md/);
});

test("context selection reports explicit omitted counts and uses a conservative token estimate", () => {
  const items: ReviewQuestionContext[] = ["a", "b", "c"].map((id) => ({
    key: id, title: "title", quizId: "quiz", question: question(id, `题目 ${id}`), misses: 1, latestAttemptAt: "2026-10-04",
  }));
  const firstSize = estimateReviewTokens(formatQuestionContext(items[0]));
  const selection = selectWithinBudget(items, formatQuestionContext, firstSize);
  assert.deepEqual({ total: selection.total, included: selection.included.length, omitted: selection.omitted }, { total: 3, included: 1, omitted: 2 });
  const prompt = buildGroundedReviewPrompt({
    kind: "wrong", questions: selection, materials: { included: [], total: 0, omitted: 0, estimatedTokens: 0 },
  });
  assert.match(prompt, /原题覆盖：1\/3，省略 2 道/);
  assert.match(prompt, /只是资料文本/);
});
