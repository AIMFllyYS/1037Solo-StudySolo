// Review「掌握度」面板的数据模型（纯函数，可单测）。
//
// 学习科学口径（面板设计依据）：
// - 分层而不是单一平均数：把章节按最近一次客观题正确率分成 掌握 / 熟悉 / 巩固中 / 薄弱 四层，
//   「薄弱 + 巩固中」才是下一步要练的对象（检索练习 + 间隔重复，优先练最弱、最近错过的）。
// - 样本量要透明：答题数太少（<5 题）的整体掌握度标成「样本少」，不假装精确。
// - 永远给「下一步」：到期闪卡（间隔重复）> 薄弱章节（针对性练习）> 还没练过（先做一套题）> 保持。

import type { ProgressEntry } from "@/lib/quiz-progress";
import { hasObjectiveAttempt, toWeakPoint } from "./wrongQuestions";

export type MasteryTier = "mastered" | "familiar" | "learning" | "weak";

export const MASTERY_TIERS: readonly MasteryTier[] = ["mastered", "familiar", "learning", "weak"];

/** 层级阈值（含下界）：≥85 掌握，≥70 熟悉，≥50 巩固中，其余薄弱。 */
export function tierOf(percent: number): MasteryTier {
  if (percent >= 85) return "mastered";
  if (percent >= 70) return "familiar";
  if (percent >= 50) return "learning";
  return "weak";
}

export interface SubjectMastery {
  subjectId: string;
  chapters: number;
  /** 按作答题数加权的平均正确率（0–100，一位小数）。 */
  percent: number;
  tier: MasteryTier;
  weakChapters: number;
  answered: number;
}

export interface MasterySummary {
  /** 有作答记录的章节数。 */
  chapters: number;
  /** 整体掌握度 0–100（按作答题数加权）；没有数据为 null。 */
  overall: number | null;
  overallTier: MasteryTier | null;
  /** 总作答题数（客观题），用于判断样本是否太少。 */
  answered: number;
  lowSample: boolean;
  /** 四层各有多少章节。 */
  distribution: Record<MasteryTier, number>;
  /** 按学科聚合，掌握度从低到高（最需要练的在前）。 */
  subjects: SubjectMastery[];
}

const LOW_SAMPLE = 5;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeMastery(entries: readonly ProgressEntry[]): MasterySummary {
  const distribution: Record<MasteryTier, number> = { mastered: 0, familiar: 0, learning: 0, weak: 0 };
  const bySubject = new Map<string, { weighted: number; weight: number; chapters: number; weak: number }>();
  let weightedTotal = 0;
  let weightTotal = 0;
  let chapters = 0;

  for (const entry of entries) {
    if (!hasObjectiveAttempt(entry)) continue;
    const point = toWeakPoint(entry);
    const weight = Math.max(1, point.answeredCount);
    const tier = tierOf(point.lastPercent);
    distribution[tier] += 1;
    chapters += 1;
    weightedTotal += point.lastPercent * weight;
    weightTotal += weight;
    const bucket = bySubject.get(entry.subjectId) ?? { weighted: 0, weight: 0, chapters: 0, weak: 0 };
    bucket.weighted += point.lastPercent * weight;
    bucket.weight += weight;
    bucket.chapters += 1;
    if (tier === "weak" || tier === "learning") bucket.weak += 1;
    bySubject.set(entry.subjectId, bucket);
  }

  const subjects: SubjectMastery[] = [...bySubject.entries()]
    .map(([subjectId, bucket]) => {
      const percent = round1(bucket.weighted / bucket.weight);
      return {
        subjectId,
        chapters: bucket.chapters,
        percent,
        tier: tierOf(percent),
        weakChapters: bucket.weak,
        answered: bucket.weight,
      };
    })
    .sort((a, b) => a.percent - b.percent);

  const overall = weightTotal > 0 ? round1(weightedTotal / weightTotal) : null;
  return {
    chapters,
    overall,
    overallTier: overall === null ? null : tierOf(overall),
    answered: weightTotal,
    lowSample: weightTotal > 0 && weightTotal < LOW_SAMPLE,
    distribution,
    subjects,
  };
}

export type NextAction =
  | { kind: "flashcards"; count: number }
  | { kind: "quiz-weak"; chapters: number }
  | { kind: "quiz-start" }
  | { kind: "keep" };

/** 下一步建议：到期闪卡 > 薄弱章节 > 还没练过 > 保持。 */
export function pickNextAction(input: { dueCards: number; weakChapters: number; answeredChapters: number }): NextAction {
  if (input.dueCards > 0) return { kind: "flashcards", count: input.dueCards };
  if (input.weakChapters > 0) return { kind: "quiz-weak", chapters: input.weakChapters };
  if (input.answeredChapters === 0) return { kind: "quiz-start" };
  return { kind: "keep" };
}
