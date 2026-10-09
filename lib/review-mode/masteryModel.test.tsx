import { describe, expect, it } from "vitest";
import type { ProgressEntry } from "@/lib/quiz-progress";
import { pickNextAction, summarizeMastery, tierOf } from "./masteryModel";

function entry(subjectId: string, chapterId: string, percent: number, questions = 10): ProgressEntry {
  return {
    subjectId,
    chapterId,
    progress: {
      best: percent,
      attempts: 1,
      last: {
        earned: 0,
        max: 0,
        percent,
        completedAt: new Date().toISOString(),
        stage: "final",
        objectiveCount: questions,
        objectiveAccuracy: percent,
      },
    },
  } as ProgressEntry;
}

describe("masteryModel", () => {
  it("tierOf 阈值：85 / 70 / 50", () => {
    expect(tierOf(100)).toBe("mastered");
    expect(tierOf(85)).toBe("mastered");
    expect(tierOf(84.9)).toBe("familiar");
    expect(tierOf(70)).toBe("familiar");
    expect(tierOf(69)).toBe("learning");
    expect(tierOf(50)).toBe("learning");
    expect(tierOf(49)).toBe("weak");
  });

  it("没有作答记录时整体为 null，分布全 0", () => {
    const summary = summarizeMastery([]);
    expect(summary.overall).toBeNull();
    expect(summary.overallTier).toBeNull();
    expect(summary.chapters).toBe(0);
    expect(summary.distribution).toEqual({ mastered: 0, familiar: 0, learning: 0, weak: 0 });
  });

  it("按作答题数加权，学科按掌握度从低到高排序，分布统计章节层级", () => {
    const summary = summarizeMastery([
      entry("a", "1", 90, 10),
      entry("a", "2", 40, 30), // 题多 → 权重大
      entry("b", "1", 75, 10),
    ]);
    expect(summary.chapters).toBe(3);
    expect(summary.distribution).toEqual({ mastered: 1, familiar: 1, learning: 0, weak: 1 });
    // 整体 = (90*10 + 40*30 + 75*10) / 50 = 57
    expect(summary.overall).toBe(57);
    expect(summary.overallTier).toBe("learning");
    expect(summary.subjects.map((s) => s.subjectId)).toEqual(["a", "b"]);
    expect(summary.subjects[0]).toMatchObject({ subjectId: "a", chapters: 2, weakChapters: 1 });
    expect(summary.lowSample).toBe(false);
  });

  it("样本太少（<5 题）标记 lowSample", () => {
    expect(summarizeMastery([entry("a", "1", 100, 3)]).lowSample).toBe(true);
  });

  it("下一步：到期闪卡 > 薄弱章节 > 还没练过 > 保持", () => {
    expect(pickNextAction({ dueCards: 4, weakChapters: 2, answeredChapters: 3 })).toEqual({ kind: "flashcards", count: 4 });
    expect(pickNextAction({ dueCards: 0, weakChapters: 2, answeredChapters: 3 })).toEqual({ kind: "quiz-weak", chapters: 2 });
    expect(pickNextAction({ dueCards: 0, weakChapters: 0, answeredChapters: 0 })).toEqual({ kind: "quiz-start" });
    expect(pickNextAction({ dueCards: 0, weakChapters: 0, answeredChapters: 3 })).toEqual({ kind: "keep" });
  });
});
