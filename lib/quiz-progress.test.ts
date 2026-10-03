import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterLabel,
  compareChapter,
  scoreGrade,
  getGlobalSummary,
  saveAttempt,
  getChapterProgress,
  clearAllProgress,
  clearChapterProgress,
  getAllProgress,
  saveSession,
  getSession,
  clearSession,
  getLegacyLocalProgress,
  beginLegacyImport,
  completeLegacyImport,
  importLegacyProgressLocally,
  getLegacyImportState,
  getOwnerLegacyImportedProgress,
  saveOwnerLegacyImportedSummary,
  type ProgressEntry,
  type QuizAttempt,
  type QuizSession,
} from "./quiz-progress.ts";
import { activateStorageOwner } from "./storage/ownerScope.ts";

// ── 纯函数（不依赖 localStorage）──────────────────────────────

test("chapterLabel：ch 前缀", () => {
  assert.equal(chapterLabel("ch01"), "第 1 章");
  assert.equal(chapterLabel("ch07"), "第 7 章");
  assert.equal(chapterLabel("ch12"), "第 12 章");
});

test("chapterLabel：rec 前缀", () => {
  assert.equal(chapterLabel("rec-03"), "录音 3");
  assert.equal(chapterLabel("rec01"), "录音 1");
});

test("chapterLabel：sum 前缀", () => {
  assert.equal(chapterLabel("sum-01"), "纪要 1");
  assert.equal(chapterLabel("sum12"), "纪要 12");
});

test("chapterLabel：未知前缀原样返回", () => {
  assert.equal(chapterLabel("unit-4"), "unit-4");
  assert.equal(chapterLabel("abc"), "abc");
});

test("chapterLabel：前导零被去除", () => {
  assert.equal(chapterLabel("ch007"), "第 7 章");
  assert.equal(chapterLabel("rec-007"), "录音 7");
});

test("compareChapter：ch < rec < sum，组内按编号升序", () => {
  const ids = ["sum-01", "rec-02", "ch03", "ch01", "rec-01", "sum-02"];
  const sorted = [...ids].sort(compareChapter);
  assert.deepEqual(sorted, ["ch01", "ch03", "rec-01", "rec-02", "sum-01", "sum-02"]);
});

test("compareChapter：相同前缀相同编号返回 0", () => {
  assert.equal(compareChapter("ch01", "ch01"), 0);
});

test("scoreGrade：各分段", () => {
  assert.equal(scoreGrade(95).label, "优秀");
  assert.equal(scoreGrade(90).label, "优秀");
  assert.equal(scoreGrade(89).label, "良好");
  assert.equal(scoreGrade(80).label, "良好");
  assert.equal(scoreGrade(79).label, "及格");
  assert.equal(scoreGrade(60).label, "及格");
  assert.equal(scoreGrade(59).label, "待加强");
  assert.equal(scoreGrade(0).label, "待加强");
});

test("getGlobalSummary：空列表返回全零", () => {
  assert.deepEqual(getGlobalSummary([]), {
    chapters: 0,
    avgBest: 0,
    totalAttempts: 0,
    bestEver: 0,
  });
});

test("getGlobalSummary：多章聚合", () => {
  const entries: ProgressEntry[] = [
    {
      subjectId: "physics",
      chapterId: "ch01",
      progress: { best: 90, objectiveBest: 90, objectiveAttempts: 2, last: makeAttempt(90), attempts: 2 },
    },
    {
      subjectId: "physics",
      chapterId: "ch02",
      progress: { best: 70, objectiveBest: 70, objectiveAttempts: 1, last: makeAttempt(70), attempts: 1 },
    },
  ];
  const summary = getGlobalSummary(entries);
  assert.equal(summary.chapters, 2);
  assert.equal(summary.avgBest, 80);
  assert.equal(summary.totalAttempts, 3);
  assert.equal(summary.bestEver, 90);
});

test("getGlobalSummary：avgBest 保留一位小数", () => {
  const entries: ProgressEntry[] = [
    {
      subjectId: "a",
      chapterId: "ch01",
      progress: { best: 85, objectiveBest: 85, objectiveAttempts: 1, last: makeAttempt(85), attempts: 1 },
    },
    {
      subjectId: "a",
      chapterId: "ch02",
      progress: { best: 72, objectiveBest: 72, objectiveAttempts: 1, last: makeAttempt(72), attempts: 1 },
    },
    {
      subjectId: "a",
      chapterId: "ch03",
      progress: { best: 90, objectiveBest: 90, objectiveAttempts: 1, last: makeAttempt(90), attempts: 1 },
    },
  ];
  // (85+72+90)/3 = 82.333... → 82.3
  assert.equal(getGlobalSummary(entries).avgBest, 82.3);
});

// ── localStorage 依赖函数 ──────────────────────────────────────

function makeAttempt(percent: number, stage: "submitted" | "final" = "final"): QuizAttempt {
  return {
    earned: percent,
    max: 100,
    percent,
    completedAt: "2025-01-01T00:00:00Z",
    stage,
    attemptId: `attempt-${percent}-${stage}`,
    objectiveCount: 1,
    correctCount: percent === 100 ? 1 : 0,
    objectiveAccuracy: percent,
    perQuestion: [{ id: "q1", awarded: percent, max: 100, correct: percent === 100 }],
  };
}

function setupLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = ls;
  // quiz-progress 用 typeof window === "undefined" 做 SSR 守卫，需同时 mock window
  (globalThis as unknown as { window: unknown }).window = new EventTarget();
}

function teardownLocalStorage() {
  activateStorageOwner(null);
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  delete (globalThis as unknown as { window?: unknown }).window;
}

test("saveAttempt + getChapterProgress：写入后可读回", () => {
  setupLocalStorage();
  try {
    const attempt = makeAttempt(85);
    const ok = saveAttempt("physics", "ch01", attempt);
    assert.equal(ok, true);
    const progress = getChapterProgress("physics", "ch01");
    assert.ok(progress);
    assert.equal(progress!.best, 85);
    assert.equal(progress!.last.percent, 85);
    assert.equal(progress!.attempts, 1);
  } finally {
    teardownLocalStorage();
  }
});

test("saveAttempt：best 取历史最高", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(60));
    saveAttempt("physics", "ch01", makeAttempt(80));
    saveAttempt("physics", "ch01", makeAttempt(70));
    const progress = getChapterProgress("physics", "ch01");
    assert.equal(progress!.best, 80);
    assert.equal(progress!.last.percent, 70);
    assert.equal(progress!.attempts, 3);
  } finally {
    teardownLocalStorage();
  }
});

test("saveAttempt：submitted 阶段不增加 attempts", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(60, "submitted"));
    const progress = getChapterProgress("physics", "ch01");
    assert.equal(progress!.attempts, 0);
  } finally {
    teardownLocalStorage();
  }
});

test("repeated final stage for the same attempt is idempotent", () => {
  setupLocalStorage();
  try {
    const attempt = makeAttempt(80);
    saveAttempt("physics", "ch01", attempt);
    saveAttempt("physics", "ch01", attempt);
    assert.equal(getChapterProgress("physics", "ch01")?.attempts, 1);
    assert.equal(getChapterProgress("physics", "ch01")?.objectiveAttempts, 1);
  } finally {
    teardownLocalStorage();
  }
});

test("owner progress is scoped; legacy v1 scores stay local until explicitly imported", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(70));
    assert.equal(getLegacyLocalProgress().length, 1);

    const ownerA = "11111111-1111-4111-8111-111111111111";
    const ownerB = "22222222-2222-4222-8222-222222222222";
    activateStorageOwner(ownerA);
    assert.equal(getChapterProgress("physics", "ch01"), null);
    const pending = beginLegacyImport(ownerA);
    assert.ok(pending);
    assert.equal(getLegacyImportState(ownerA)?.status, "pending");
    assert.equal(importLegacyProgressLocally(ownerA), true);
    assert.equal(getChapterProgress("physics", "ch01"), null, "legacy summaries stay separate from current objective mastery");
    assert.equal(getOwnerLegacyImportedProgress(ownerA)[0]?.progress.last.percent, 70);
    assert.equal(importLegacyProgressLocally(ownerA), true, "replaying the same import is idempotent");
    assert.equal(completeLegacyImport(ownerA, pending!.importId), true);
    assert.equal(getLegacyImportState(ownerA)?.status, "complete");

    activateStorageOwner(ownerB);
    assert.equal(getChapterProgress("physics", "ch01"), null);
    assert.equal(getLegacyLocalProgress().length, 1);
  } finally {
    teardownLocalStorage();
  }
});

test("compact server legacy summaries hydrate as separate history and never enter mastery statistics", () => {
  setupLocalStorage();
  try {
    const owner = "33333333-3333-4333-8333-333333333333";
    activateStorageOwner(owner);
    assert.equal(saveOwnerLegacyImportedSummary({
      ownerId: owner, subjectId: "physics", categoryId: "detail", chapterId: "ch02",
      best: 75, attempts: 3, lastPercent: 60, completedAt: "2026-10-03T00:00:00Z", stage: "final",
    }), true);
    assert.equal(getOwnerLegacyImportedProgress(owner).length, 1);
    assert.equal(getAllProgress().length, 0);
    assert.deepEqual(getGlobalSummary(), { chapters: 0, avgBest: 0, totalAttempts: 0, bestEver: 0 });
  } finally {
    teardownLocalStorage();
  }
});

test("saveAttempt：空 subjectId 或 chapterId 返回 false", () => {
  setupLocalStorage();
  try {
    assert.equal(saveAttempt("", "ch01", makeAttempt(80)), false);
    assert.equal(saveAttempt("physics", "", makeAttempt(80)), false);
  } finally {
    teardownLocalStorage();
  }
});

test("getChapterProgress：无记录返回 null", () => {
  setupLocalStorage();
  try {
    assert.equal(getChapterProgress("physics", "ch99"), null);
  } finally {
    teardownLocalStorage();
  }
});

test("clearChapterProgress：删除单章", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(80));
    saveAttempt("physics", "ch02", makeAttempt(90));
    clearChapterProgress("physics", "ch01");
    assert.equal(getChapterProgress("physics", "ch01"), null);
    assert.ok(getChapterProgress("physics", "ch02"));
  } finally {
    teardownLocalStorage();
  }
});

test("clearAllProgress：清空全部", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(80));
    clearAllProgress();
    assert.equal(getChapterProgress("physics", "ch01"), null);
  } finally {
    teardownLocalStorage();
  }
});

test("getAllProgress：返回所有章节条目", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(80));
    saveAttempt("chemistry", "ch02", makeAttempt(90));
    const all = getAllProgress();
    assert.equal(all.length, 2);
  } finally {
    teardownLocalStorage();
  }
});

// ── 答题会话（session）持久化 ──────────────────────────────────

function makeSession(phase: QuizSession["phase"] = "answering"): QuizSession {
  return {
    answers: { q1: 0, q2: "test answer" },
    phase,
    currentIndex: 1,
    hintsUsed: ["q1"],
    selfScores: { q3: 5 },
    savedAt: "2025-01-01T00:00:00Z",
  };
}

test("saveSession + getSession：写入后可读回", () => {
  setupLocalStorage();
  try {
    const ok = saveSession("physics", "ch01", makeSession());
    assert.equal(ok, true);
    const session = getSession("physics", "ch01");
    assert.ok(session);
    assert.equal(session!.phase, "answering");
    assert.equal(session!.currentIndex, 1);
    assert.deepEqual(session!.answers, { q1: 0, q2: "test answer" });
    assert.deepEqual(session!.hintsUsed, ["q1"]);
    assert.deepEqual(session!.selfScores, { q3: 5 });
  } finally {
    teardownLocalStorage();
  }
});

test("saveSession：覆盖式仅保留一份最新", () => {
  setupLocalStorage();
  try {
    saveSession("physics", "ch01", makeSession("answering"));
    saveSession("physics", "ch01", makeSession("scoring"));
    const session = getSession("physics", "ch01");
    assert.equal(session!.phase, "scoring");
  } finally {
    teardownLocalStorage();
  }
});

test("saveSession：保留已有的 best/last/attempts", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(85));
    saveSession("physics", "ch01", makeSession());
    const progress = getChapterProgress("physics", "ch01");
    assert.ok(progress);
    assert.equal(progress!.best, 85);
    assert.equal(progress!.attempts, 1);
    assert.ok(progress!.session);
  } finally {
    teardownLocalStorage();
  }
});

test("clearSession：清除 session 但保留 best/last/attempts", () => {
  setupLocalStorage();
  try {
    saveAttempt("physics", "ch01", makeAttempt(90));
    saveSession("physics", "ch01", makeSession());
    clearSession("physics", "ch01");
    assert.equal(getSession("physics", "ch01"), null);
    const progress = getChapterProgress("physics", "ch01");
    assert.ok(progress);
    assert.equal(progress!.best, 90);
    assert.equal(progress!.attempts, 1);
    assert.equal(progress!.session, undefined);
  } finally {
    teardownLocalStorage();
  }
});

test("getSession：无记录返回 null", () => {
  setupLocalStorage();
  try {
    assert.equal(getSession("physics", "ch99"), null);
  } finally {
    teardownLocalStorage();
  }
});
