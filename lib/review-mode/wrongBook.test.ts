import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReinforcePrompt, describeCorrect, readWrongBook, recordQuestionOutcomes, recordWrongQuestions, sourceHref } from "./wrongBook.ts";
import type { QuizQuestion } from "../quiz/types.ts";

function memory() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}
const q = (stem: string, answer: number | number[], type: QuizQuestion["type"] = "single_choice") =>
  ({ id: stem, type, stem, options: ["甲", "乙", "丙"], answer, points: 2, difficulty: "basic", source: "current_chapter", explanation: "因为…" }) as unknown as QuizQuestion;

test("records wrong questions per owner key and dedupes by stem", () => {
  const s = memory();
  const src = { subjectId: "probability", chapterId: "ch01", label: "概率论 · 随机事件" };
  assert.equal(recordWrongQuestions([q("P(A∪B)=?", 1)], src, new Date("2026-09-29T00:00:00Z"), s, "k1"), 1);
  recordWrongQuestions([q("P(A ∪ B)=?", 1)], src, new Date("2026-09-29T01:00:00Z"), s, "k1");
  const book = readWrongBook(s, "k1");
  assert.equal(book.length, 1);
  assert.equal(book[0].misses, 2);
  assert.equal(book[0].correct, "B. 乙");
  // 另一个账号看不到
  assert.equal(readWrongBook(s, "k2").length, 0);
});

test("without an owner nothing is persisted", () => {
  const s = memory();
  assert.equal(recordWrongQuestions([q("x", 0)], { subjectId: "a", chapterId: "b", label: "l" }, new Date(), s, null), 0);
  assert.deepEqual(readWrongBook(s, null), []);
});

test("describes answers for multi and true/false", () => {
  assert.equal(describeCorrect(q("m", [0, 2], "multiple_choice")), "A. 甲；C. 丙");
  assert.equal(describeCorrect(q("t", 1, "true_false")), "正确");
});

test("sources link back to the knowledge point", () => {
  assert.equal(sourceHref({ subjectId: "classroom", chapterId: "abc", label: "" }), "/class?session=abc");
  assert.equal(sourceHref({ subjectId: "probability", chapterId: "ch01", label: "" }), "/probability/detail/ch01");
  assert.equal(sourceHref({ subjectId: "review", chapterId: "wrong-questions", label: "" }), null);
});

test("reinforce prompt is grounded on real wrong questions", () => {
  const s = memory();
  recordWrongQuestions([q("可导与连续的关系？", 0)], { subjectId: "classroom", chapterId: "s1", label: "课堂 · 导数" }, new Date(), s, "k");
  const prompt = buildReinforcePrompt(readWrongBook(s, "k"));
  assert.ok(prompt && prompt.includes("【课堂 · 导数】可导与连续的关系？"));
  assert.ok(prompt.includes("正确答案：A. 甲"));
  assert.equal(buildReinforcePrompt([]), null);
});

test("stable question outcome keeps historical misses, dedupes one attempt, and tracks a later correct answer", () => {
  const s = memory();
  const src = { subjectId: "chemistry", chapterId: "ch01", categoryId: "detail", label: "化学 · 氧化还原", quizId: "quiz-1" };
  const item = q("氧化数升高表示？", 1);
  recordQuestionOutcomes([{ question: item, correct: false, answer: 0 }], src, "a".repeat(64), "attempt-a", new Date("2026-10-01T00:00:00Z"), s, "owner");
  recordQuestionOutcomes([{ question: item, correct: false, answer: 0 }], src, "a".repeat(64), "attempt-a", new Date("2026-10-01T01:00:00Z"), s, "owner");
  let entry = readWrongBook(s, "owner")[0];
  assert.equal(entry.misses, 1);
  assert.equal(entry.lastWrongAnswer, 0);
  recordQuestionOutcomes([{ question: item, correct: true, answer: 1 }], { ...src, attemptId: "attempt-b" }, "a".repeat(64), "attempt-b", new Date("2026-10-02T00:00:00Z"), s, "owner");
  entry = readWrongBook(s, "owner")[0];
  assert.equal(entry.latestCorrect, true);
  assert.equal(entry.misses, 1, "a later success keeps the historical miss but is no longer a current weak point");
  assert.equal(buildReinforcePrompt([entry]), null);
  recordQuestionOutcomes([{ question: item, correct: false, answer: 0 }], src, "a".repeat(64), "attempt-c", new Date("2026-10-03T00:00:00Z"), s, "owner");
  entry = readWrongBook(s, "owner")[0];
  assert.equal(entry.latestCorrect, false);
  assert.equal(entry.misses, 2);
});
