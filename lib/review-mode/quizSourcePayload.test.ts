import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWrongQuizSource } from "./quizSourcePayload";
import type { WrongEntry } from "./wrongBook";
import type { WeakPoint } from "./wrongQuestions";

const entry = (id: string, stem = "真实原题"): WrongEntry => ({ id, stem, correct: "参考答案", misses: 1,
  createdAt: "2026-10-10T00:00:00Z", source: { subjectId: "probability", chapterId: "ch01", label: "章节", quizId: "quiz" },
  question: { id, stem, type: "true_false", difficulty: "basic", source: "current_chapter", points: 1, answer: 1 },
});
const point = (index: number): WeakPoint => ({ subjectId: "probability", categoryId: "detail", chapterId: `ch${index}`,
  chapterLabel: `章 ${index}`, lastPercent: 50, best: 75, wrongCount: 1, answeredCount: 2, weakness: 0.5 });

test("wrong sources deduplicate attempt ids and report incomplete account coverage", () => {
  const local = entry("local"); local.attemptIds = ["shared", "local-attempt"];
  const account = { attemptIds: ["shared", ...Array.from({ length: 1001 }, (_, index) => `remote-${index}`)], hasMoreAttemptRecords: false };
  const { source } = buildWrongQuizSource([local], account, []);
  assert.equal(source.attemptIds.length, 1000);
  assert.deepEqual(source.attemptIds.slice(0, 2), ["shared", "local-attempt"]);
  assert.equal(source.hasMoreAttemptRecords, true);
  assert.equal(source.localQuestions[0].question, local.question);
});

test("UTF-8 source budget omits whole questions, retains later fitting questions and records counts", () => {
  const entries = [entry("first", "中".repeat(14000)), entry("second", "文".repeat(14000)), entry("omitted", "字".repeat(14000)), entry("later")];
  const { source } = buildWrongQuizSource(entries, { attemptIds: [], hasMoreAttemptRecords: false }, []);
  assert.deepEqual(source.localQuestions.map(question => question.key), ["first", "second", "later"]);
  assert.equal(source.omittedLocalQuestionCount, 1);
  assert.ok(source.localQuestions.reduce((bytes, question) => bytes + new TextEncoder().encode(JSON.stringify(question)).byteLength, 0) <= 110000);
  assert.equal(entries[2].question?.stem.length, 14000);
});

test("local question and weak-point bounds remain separate from legacy missing snapshots", () => {
  const entries = Array.from({ length: 22 }, (_, index) => entry(`q-${index}`));
  const legacy = entry("legacy"); delete legacy.question;
  const points = Array.from({ length: 22 }, (_, index) => point(index));
  const { source } = buildWrongQuizSource([...entries, legacy], { attemptIds: [], hasMoreAttemptRecords: true }, points);
  assert.equal(source.localQuestions.length, 20);
  assert.equal(source.omittedLocalQuestionCount, 2);
  assert.equal(source.weakPoints.length, 20);
  assert.equal(source.omittedWeakPointCount, 2);
  assert.equal(source.hasMoreAttemptRecords, true);
  assert.equal(source.localQuestions.some(question => question.key === "legacy"), false);
});
