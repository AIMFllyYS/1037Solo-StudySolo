import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProgressEntry } from "@/lib/quiz-progress";
import {
  buildWrongQuestionPrompt,
  selectWeakPoints,
  summarizeWrongQuestions,
  toWeakPoint,
  WEAK_PERCENT_THRESHOLD,
} from "./wrongQuestions";

function entry(
  subjectId: string,
  chapterId: string,
  percent: number,
  perQuestion?: { correct: boolean | null }[],
  best = percent,
): ProgressEntry {
  return {
    subjectId,
    chapterId,
    progress: {
      best,
      attempts: 1,
      last: {
        earned: 0,
        max: 0,
        percent,
        completedAt: new Date().toISOString(),
        stage: "final",
        perQuestion: perQuestion?.map((q, i) => ({ id: `q${i}`, awarded: 0, max: 1, correct: q.correct })),
      },
    },
  };
}

test("toWeakPoint 统计错题数与答题数（忽略主观题 null）", () => {
  const w = toWeakPoint(
    entry("physics", "ch01", 40, [{ correct: true }, { correct: false }, { correct: false }, { correct: null }]),
  );
  assert.equal(w.subjectId, "physics");
  assert.equal(w.chapterLabel, "第 1 章");
  assert.equal(w.wrongCount, 2);
  assert.equal(w.answeredCount, 3); // null 的主观题不计
  assert.equal(w.lastPercent, 40);
  assert.ok(w.weakness > 0.5, "低分应有较高薄弱度");
});

test("selectWeakPoints 只取低于阈值的章节并按薄弱度降序", () => {
  const entries = [
    entry("physics", "ch01", 30, [{ correct: false }, { correct: false }]),
    entry("physics", "ch02", 95, [{ correct: true }]), // 高分，过滤掉
    entry("chemistry", "ch03", 55, [{ correct: false }, { correct: true }]),
  ];
  const weak = selectWeakPoints(entries);
  assert.equal(weak.length, 2);
  assert.equal(weak[0].chapterId, "ch01"); // 30 分最弱
  assert.equal(weak[1].chapterId, "ch03");
  assert.ok(weak.every((w) => w.lastPercent < WEAK_PERCENT_THRESHOLD));
});

test("selectWeakPoints 忽略从未作答的章节，limit 生效", () => {
  const entries = [
    entry("physics", "ch01", 0, []), // 未作答
    entry("physics", "ch02", 10),
    entry("physics", "ch03", 20),
    entry("physics", "ch04", 30),
  ];
  const weak = selectWeakPoints(entries, { limit: 2 });
  assert.equal(weak.length, 2);
  assert.ok(!weak.some((w) => w.chapterId === "ch01"));
});

test("summarizeWrongQuestions 汇总平均正确率与薄弱章数", () => {
  const entries = [
    entry("physics", "ch01", 40, [{ correct: false }]),
    entry("physics", "ch02", 60, [{ correct: false }, { correct: true }]),
    entry("physics", "ch03", 100, [{ correct: true }]),
  ];
  const overview = summarizeWrongQuestions(entries);
  assert.equal(overview.chapters, 3);
  assert.equal(overview.weakChapters, 2); // ch01, ch02 < 80
  // (40+60+100)/3 = 66.7
  assert.equal(overview.recentAccuracy, 66.7);
});

test("空数据：概览全 0，prompt 走兜底", () => {
  const overview = summarizeWrongQuestions([]);
  assert.deepEqual(overview, { chapters: 0, weakChapters: 0, recentAccuracy: 0, weakPoints: [] });
  const prompt = buildWrongQuestionPrompt([]);
  assert.match(prompt, /诊断题/);
});

test("buildWrongQuestionPrompt 列出薄弱章节与错题数，含 diagnose", () => {
  const weak = selectWeakPoints([entry("physics", "ch01", 30, [{ correct: false }, { correct: false }])]);
  const prompt = buildWrongQuestionPrompt(weak, (id) => (id === "physics" ? "大学物理" : id));
  assert.match(prompt, /大学物理 · 第 1 章/);
  assert.match(prompt, /2\/2 题答错/);
  assert.match(prompt, /diagnose/);
});
