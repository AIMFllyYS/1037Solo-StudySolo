import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countDue,
  initialSchedule,
  isDue,
  masteryOf,
  MAX_EASINESS,
  MIN_EASINESS,
  schedule,
  type CardSchedule,
} from "./scheduler";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

test("新卡立即到期，掌握度为 0", () => {
  const s = initialSchedule(NOW);
  assert.equal(s.reps, 0);
  assert.equal(s.easiness, 2.5);
  assert.equal(s.due, NOW);
  assert.equal(isDue(s, NOW), true);
  assert.equal(masteryOf(s), 0);
  // undefined（从未见过）也算到期。
  assert.equal(isDue(undefined, NOW), true);
});

test("good：reps 1→1 天、2→6 天、之后按 easiness 增长", () => {
  let s = initialSchedule(NOW);
  s = schedule(s, "good", NOW);
  assert.equal(s.reps, 1);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.due, NOW + DAY);

  s = schedule(s, "good", NOW);
  assert.equal(s.reps, 2);
  assert.equal(s.intervalDays, 6);

  s = schedule(s, "good", NOW);
  assert.equal(s.reps, 3);
  // 6 * easiness(2.5) = 15
  assert.equal(s.intervalDays, 15);
});

test("again：reps 归零、间隔重置、easiness 略降、10 分钟内再问", () => {
  let s = initialSchedule(NOW);
  s = schedule(s, "good", NOW);
  s = schedule(s, "good", NOW);
  const before = s.easiness;
  s = schedule(s, "again", NOW);
  assert.equal(s.reps, 0);
  assert.equal(s.intervalDays, 0);
  assert.ok(s.due > NOW && s.due < NOW + DAY, "again 后应在一天内再见");
  assert.ok(s.easiness < before, "again 应降低 easiness");
});

test("hard 间隔增长慢于 good；easy 快于 good", () => {
  const base = schedule(schedule(initialSchedule(NOW), "good", NOW), "good", NOW); // interval 6
  const hard = schedule(base, "hard", NOW);
  const good = schedule(base, "good", NOW);
  const easy = schedule(base, "easy", NOW);
  assert.ok(hard.intervalDays < good.intervalDays, "hard 应短于 good");
  assert.ok(easy.intervalDays > good.intervalDays, "easy 应长于 good");
});

test("easiness 被夹在 [1.3, 3.0]", () => {
  let s = initialSchedule(NOW);
  for (let i = 0; i < 20; i += 1) s = schedule(s, "again", NOW);
  assert.ok(s.easiness >= MIN_EASINESS);
  s = initialSchedule(NOW);
  for (let i = 0; i < 20; i += 1) s = schedule(s, "easy", NOW);
  assert.ok(s.easiness <= MAX_EASINESS);
});

test("masteryOf 随 good 复习递增", () => {
  let s = initialSchedule(NOW);
  const m0 = masteryOf(s);
  s = schedule(s, "good", NOW);
  const m1 = masteryOf(s);
  s = schedule(s, "good", NOW);
  s = schedule(s, "good", NOW);
  const m3 = masteryOf(s);
  assert.ok(m1 > m0);
  assert.ok(m3 > m1);
  assert.ok(m3 <= 1);
});

test("countDue 统计到期张数（未来到期的不计）", () => {
  const dueNow = initialSchedule(NOW);
  const future: CardSchedule = { ...initialSchedule(NOW), due: NOW + 5 * DAY };
  assert.equal(countDue([dueNow, future, undefined], NOW), 2);
});

test("纯函数：schedule 不改入参", () => {
  const s = initialSchedule(NOW);
  const snapshot = JSON.stringify(s);
  schedule(s, "good", NOW);
  assert.equal(JSON.stringify(s), snapshot);
});
