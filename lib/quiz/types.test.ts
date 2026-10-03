import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isObjective,
  isObjectivelyGradableQuestion,
  isComposite,
  displayLabel,
  maxPointsOf,
  autoGrade,
  OBJECTIVE_TYPES,
  SUBJECTIVE_TYPES,
  COMPOSITE_TYPES,
  TYPE_LABELS,
  type QuizQuestion,
} from "./types.ts";

function makeQ(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: "q1",
    type: "single_choice",
    difficulty: "medium",
    source: "current_chapter",
    points: 10,
    stem: "题干",
    answer: 0,
    options: ["A", "B", "C", "D"],
    ...overrides,
  };
}

// ── isObjective / isComposite ──────────────────────────────────

test("isObjective：single_choice / multiple_choice / true_false 为 true", () => {
  assert.equal(isObjective("single_choice"), true);
  assert.equal(isObjective("multiple_choice"), true);
  assert.equal(isObjective("true_false"), true);
});

test("isObjective：主观题和复合题为 false", () => {
  assert.equal(isObjective("essay"), false);
  assert.equal(isObjective("analysis"), false);
  assert.equal(isObjective("fill_blank"), false);
  assert.equal(isObjective("reading"), false);
  assert.equal(isObjective("cloze"), false);
  assert.equal(isObjective("translation"), false);
});

test("isComposite：reading / cloze / translation 为 true", () => {
  assert.equal(isComposite("reading"), true);
  assert.equal(isComposite("cloze"), true);
  assert.equal(isComposite("translation"), true);
});

test("isComposite：非复合题为 false", () => {
  assert.equal(isComposite("single_choice"), false);
  assert.equal(isComposite("essay"), false);
});

test("isObjectivelyGradableQuestion：reading/cloze require gradable child snapshots", () => {
  assert.equal(isObjectivelyGradableQuestion(makeQ({ type: "reading", subQuestions: [{ id: "s1", type: "single_choice", stem: "s", answer: 0, options: ["A", "B"], points: 1 }] })), true);
  assert.equal(isObjectivelyGradableQuestion(makeQ({ type: "reading", subQuestions: [] })), false);
  assert.equal(isObjectivelyGradableQuestion(makeQ({ type: "cloze", blanks: [{ id: "b1", options: ["A", "B"], answer: 0, points: 1 }] })), true);
  assert.equal(isObjectivelyGradableQuestion(makeQ({ type: "cloze", blanks: [] })), false);
  assert.equal(isObjectivelyGradableQuestion(makeQ({ type: "essay" })), false);
});

test("OBJECTIVE_TYPES / SUBJECTIVE_TYPES / COMPOSITE_TYPES 不重叠", () => {
  const objSet = new Set(OBJECTIVE_TYPES);
  const subSet = new Set(SUBJECTIVE_TYPES);
  for (const t of OBJECTIVE_TYPES) assert.ok(!subSet.has(t));
  for (const t of SUBJECTIVE_TYPES) assert.ok(!objSet.has(t));
  for (const t of COMPOSITE_TYPES) assert.ok(!objSet.has(t));
});

// ── displayLabel ───────────────────────────────────────────────

test("displayLabel：有 label 时优先用 label", () => {
  assert.equal(displayLabel(makeQ({ label: "材料分析题" })), "材料分析题");
});

test("displayLabel：无 label 时用类型默认名", () => {
  assert.equal(displayLabel(makeQ({ type: "single_choice" })), "单选题");
  assert.equal(displayLabel(makeQ({ type: "essay" })), "解答题");
});

test("displayLabel：label 为空白时回退类型默认名", () => {
  assert.equal(displayLabel(makeQ({ label: "   " })), "单选题");
});

test("TYPE_LABELS：覆盖所有 QuestionType", () => {
  const allTypes = [...OBJECTIVE_TYPES, ...SUBJECTIVE_TYPES, ...COMPOSITE_TYPES];
  for (const t of allTypes) {
    assert.ok(TYPE_LABELS[t], `${t} 应有默认标签`);
  }
});

// ── maxPointsOf ────────────────────────────────────────────────

test("maxPointsOf：客观题用 points", () => {
  assert.equal(maxPointsOf(makeQ({ type: "single_choice", points: 10 })), 10);
});

test("maxPointsOf：主观题优先 total_points", () => {
  assert.equal(
    maxPointsOf(makeQ({ type: "essay", points: 10, total_points: 20 })),
    20,
  );
});

test("maxPointsOf：主观题无 total_points 时用 points", () => {
  assert.equal(maxPointsOf(makeQ({ type: "essay", points: 15 })), 15);
});

test("maxPointsOf：客观题忽略 total_points", () => {
  assert.equal(
    maxPointsOf(makeQ({ type: "single_choice", points: 10, total_points: 99 })),
    10,
  );
});

// ── autoGrade ──────────────────────────────────────────────────

test("autoGrade：single_choice 答对满分", () => {
  const q = makeQ({ type: "single_choice", points: 10, answer: 2 });
  const [earned, correct] = autoGrade(q, 2);
  assert.equal(earned, 10);
  assert.equal(correct, true);
});

test("autoGrade：single_choice 答错 0 分", () => {
  const q = makeQ({ type: "single_choice", points: 10, answer: 2 });
  const [earned, correct] = autoGrade(q, 1);
  assert.equal(earned, 0);
  assert.equal(correct, false);
});

test("autoGrade：true_false 答对", () => {
  const q = makeQ({ type: "true_false", points: 5, answer: 1, options: undefined });
  const [earned, correct] = autoGrade(q, 1);
  assert.equal(earned, 5);
  assert.equal(correct, true);
});

test("autoGrade：multiple_choice 全对满分", () => {
  const q = makeQ({ type: "multiple_choice", points: 10, answer: [0, 2] });
  const [earned, correct] = autoGrade(q, [0, 2]);
  assert.equal(earned, 10);
  assert.equal(correct, true);
});

test("autoGrade：multiple_choice 漏选得半分", () => {
  const q = makeQ({ type: "multiple_choice", points: 10, answer: [0, 2] });
  const [earned, correct] = autoGrade(q, [0]);
  assert.equal(earned, 5);
  assert.equal(correct, false);
});

test("autoGrade：multiple_choice 错选 0 分", () => {
  const q = makeQ({ type: "multiple_choice", points: 10, answer: [0, 2] });
  const [earned, correct] = autoGrade(q, [0, 1]);
  assert.equal(earned, 0);
  assert.equal(correct, false);
});

test("autoGrade：multiple_choice 不选 0 分", () => {
  const q = makeQ({ type: "multiple_choice", points: 10, answer: [0, 2] });
  const [earned, correct] = autoGrade(q, []);
  assert.equal(earned, 0);
  assert.equal(correct, false);
});

test("autoGrade：reading 复合题按子题累加", () => {
  const q = makeQ({
    type: "reading",
    points: 20,
    answer: "",
    passage: "passage",
    subQuestions: [
      { id: "s1", type: "single_choice", stem: "s1", options: ["A", "B"], answer: 0, points: 10 },
      { id: "s2", type: "single_choice", stem: "s2", options: ["A", "B"], answer: 1, points: 10 },
    ],
  });
  const [earned, correct] = autoGrade(q, { s1: 0, s2: 1 });
  assert.equal(earned, 20);
  assert.equal(correct, true);
});

test("autoGrade：reading 部分对", () => {
  const q = makeQ({
    type: "reading",
    points: 20,
    answer: "",
    subQuestions: [
      { id: "s1", type: "single_choice", stem: "s1", options: ["A", "B"], answer: 0, points: 10 },
      { id: "s2", type: "single_choice", stem: "s2", options: ["A", "B"], answer: 1, points: 10 },
    ],
  });
  const [earned, correct] = autoGrade(q, { s1: 0, s2: 0 });
  assert.equal(earned, 10);
  assert.equal(correct, false);
});

test("autoGrade：cloze 复合题按空累加", () => {
  const q = makeQ({
    type: "cloze",
    points: 10,
    answer: "",
    blanks: [
      { id: "b1", options: ["A", "B"], answer: 0, points: 5 },
      { id: "b2", options: ["A", "B"], answer: 1, points: 5 },
    ],
  });
  const [earned, correct] = autoGrade(q, { b1: 0, b2: 1 });
  assert.equal(earned, 10);
  assert.equal(correct, true);
});

test("autoGrade：主观题返回 [0, false]", () => {
  const q = makeQ({ type: "essay", points: 20, answer: "参考答案" });
  const [earned, correct] = autoGrade(q, "学生答案");
  assert.equal(earned, 0);
  assert.equal(correct, false);
});
