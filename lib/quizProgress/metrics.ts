import type { ChapterProgress } from "./contracts";
/** Objective-only mastery fields; legacy-only scores intentionally return null/zero. */
export function objectiveBestOf(progress: ChapterProgress): number | null {
  return typeof progress.objectiveBest === "number" && Number.isFinite(progress.objectiveBest) ? progress.objectiveBest : null;
}

export function objectiveAttemptsOf(progress: ChapterProgress): number {
  if (typeof progress.objectiveAttempts === "number") return progress.objectiveAttempts;
  const attempt = progress.last;
  if (typeof attempt?.objectiveCount === "number") return attempt.objectiveCount > 0 ? progress.attempts : 0;
  return attempt?.perQuestion?.some((item) => item.correct !== null) ? progress.attempts : 0;
}

export function objectiveAccuracyOf(progress: ChapterProgress): number | null {
  const attempt = progress.last;
  if (typeof attempt?.objectiveAccuracy === "number" && Number.isFinite(attempt.objectiveAccuracy)) return attempt.objectiveAccuracy;
  const perQuestion = attempt?.perQuestion?.filter((item) => item.correct !== null) ?? [];
  if (perQuestion.length) return Math.round((perQuestion.filter((item) => item.correct === true).length / perQuestion.length) * 1000) / 10;
  if (typeof attempt?.objectiveCount === "number" && attempt.objectiveCount > 0 && typeof attempt.correctCount === "number") {
    return Math.round((attempt.correctCount / attempt.objectiveCount) * 1000) / 10;
  }
  return null;
}

// ── 展示辅助（标签 / 排序 / 评级）──────────────────────────────

/** 章节 id → 中文短标签：ch07→「第 7 章」、rec-03→「录音 3」、sum-01→「纪要 1」。 */
export function chapterLabel(chapterId: string): string {
  const m = /^([a-z]+)-?0*(\d+)$/i.exec(chapterId);
  if (m) {
    const prefix = m[1].toLowerCase();
    const n = m[2];
    if (prefix === "ch") return `第 ${n} 章`;
    if (prefix === "rec") return `录音 ${n}`;
    if (prefix === "sum") return `纪要 ${n}`;
  }
  return chapterId;
}

function chapterRank(id: string): [number, number] {
  const m = /^([a-z]+)-?0*(\d+)/i.exec(id);
  const prefix = (m?.[1] ?? id).toLowerCase();
  const num = m ? parseInt(m[2], 10) : 0;
  const order = prefix === "ch" ? 0 : prefix === "rec" ? 1 : prefix === "sum" ? 2 : 3;
  return [order, num];
}

/** 章节排序：ch < rec < sum，组内按编号升序。 */
export function compareChapter(a: string, b: string): number {
  const [ra, na] = chapterRank(a);
  const [rb, nb] = chapterRank(b);
  return ra - rb || na - nb;
}

/** 百分制 → 评级（与 QuizSummary 一致的色阶）。 */
export function scoreGrade(percent: number): { label: string; color: string } {
  if (percent >= 90) return { label: "优秀", color: "var(--color-success)" };
  if (percent >= 80) return { label: "良好", color: "var(--color-info)" };
  if (percent >= 60) return { label: "及格", color: "var(--color-warning)" };
  return { label: "待加强", color: "var(--md-sys-color-error)" };
}
