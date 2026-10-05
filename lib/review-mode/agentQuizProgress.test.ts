import assert from "node:assert/strict";
import { test } from "node:test";
import { agentQuizSet, completeAgentQuizAttempt, openAgentQuizAttempt } from "./agentQuizProgress.ts";
import { createReviewAttempt, prepareReviewAttemptCheckpoint, savePreparedReviewAttempt } from "./progressSync.ts";
import type { QuizQuestion } from "@/lib/quiz/types";

const questions: QuizQuestion[] = [{ id: "public-original", type: "true_false", difficulty: "basic", source: "current_chapter", points: 1, stem: "公开测试：2+2=4", answer: 1 }];

test("generated quiz identities are stable, virtual, and identical across legacy inline/dock hosts", async () => {
  const set = await agentQuizSet("公开测试", questions, "public-tool-id");
  assert.deepEqual(set, await agentQuizSet("公开测试", questions, "public-tool-id"));
  assert.equal(set.sourceKind, "review-chapter");
  assert.equal(set.subjectId, "review");
  assert.equal(set.categoryId, "agent");
  assert.match(set.chapterId, /^agent:[a-f0-9]{64}$/);
  const legacy = await agentQuizSet("旧公开题", questions, "legacy");
  assert.deepEqual(legacy, await agentQuizSet("旧公开题", questions, legacy.quizId));
  const another = await agentQuizSet("另一套旧题", questions, "legacy");
  assert.notEqual(legacy.quizId, another.quizId);
});

test("restored self scores retain the API's cap and do not inflate objective accuracy", async () => {
  const all: QuizQuestion[] = [questions[0], { ...questions[0], id: "unanswered" },
    { ...questions[0], id: "self-scored", type: "essay", points: 3, answer: "公开参考答案" },
    { ...questions[0], id: "unscored-essay", type: "essay", points: 2, answer: "另一参考答案" }];
  const set = await agentQuizSet("已恢复自评", all, "public-self-score");
  const restored = { ...createReviewAttempt(set, null), answers: { "public-original": 1 }, selfScores: { "self-scored": 99 } };
  const completed = completeAgentQuizAttempt(restored, all);
  assert.deepEqual(completed.questionResults.map(({ id, awarded, correct, objective, scored }) => ({ id, awarded, correct, objective, scored })), [
    { id: "public-original", awarded: 1, correct: true, objective: true, scored: true },
    { id: "unanswered", awarded: 0, correct: null, objective: true, scored: false },
    { id: "self-scored", awarded: 3, correct: null, objective: false, scored: true },
    { id: "unscored-essay", awarded: 0, correct: null, objective: false, scored: false },
  ]);
  assert.deepEqual(completed.score, { earned: 4, max: 4, percent: 100, objectiveCount: 1, correctCount: 1, scoredCount: 2 });
  assert.deepEqual(completed.selfScores, restored.selfScores);
});

test("the existing device attempt store restores a generated summary and preserves new redo attempts", async () => {
  const values = new Map<string, string>();
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
  const globals = globalThis as unknown as { window?: Window; localStorage?: Storage };
  const previousWindow = globals.window;
  const previousStorage = globals.localStorage;
  globals.window = new EventTarget() as Window;
  globals.localStorage = store;
  try {
    const set = await agentQuizSet("公开测试", questions, "device-public-tool");
    const first = await openAgentQuizAttempt(set, null);
    const completed = completeAgentQuizAttempt({ ...first, answers: { "public-original": 0 }, revealedQuestionIds: ["public-original"] }, questions);
    await savePreparedReviewAttempt(prepareReviewAttemptCheckpoint(completed));
    const restored = await openAgentQuizAttempt(set, null);
    assert.equal(restored.attemptId, first.attemptId);
    assert.equal(restored.phase, "summary");
    assert.equal(restored.questionResults[0].correct, false);
    const next = await openAgentQuizAttempt(set, null, true);
    assert.notEqual(next.attemptId, first.attemptId);
    assert.equal(next.phase, "answering");
    assert.deepEqual(next.answers, {});
  } finally {
    globals.window = previousWindow;
    globals.localStorage = previousStorage;
  }
});
