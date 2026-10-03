// Review 模式「错题智能出题」的数据聚合（纯函数，可单测）。
//
// 数据来源：lib/quiz-progress 的成绩本（getAllProgress）。它按 subject/chapter 记录
// 历史最佳分、最近一次作答（含每题 correct 快照）与累计次数，但**不保存题干原文**。
// 因此这里把「薄弱知识点」落到 subject/chapter 粒度：按最近一次作答的正确率与错题数排序，
// 取最弱的若干章作为出题目标，交给 Agent 针对这些章统一出题。

import type { ProgressEntry } from "@/lib/quiz-progress";
import { chapterLabel } from "@/lib/quiz-progress";

/** 一个薄弱知识点条目（章节粒度）。 */
export interface WeakPoint {
  subjectId: string;
  categoryId?: string;
  chapterId: string;
  /** 人类可读章节名，如「第 7 章」。 */
  chapterLabel: string;
  /** 最近一次作答的百分制得分。 */
  lastPercent: number;
  /** 历史最佳百分制。 */
  best: number;
  /** 最近一次作答中答错（含未完全答对）的客观题数。 */
  wrongCount: number;
  /** 最近一次作答的客观题总数（有 perQuestion 快照时）。 */
  answeredCount: number;
  /** 综合薄弱程度 0–1（越大越薄弱），用于排序与展示。 */
  weakness: number;
}

/** 判定「值得加固」的阈值：最近得分低于此值即视为薄弱。 */
export const WEAK_PERCENT_THRESHOLD = 80;

function objectiveScores(entry: ProgressEntry): { total: number; correct: number } {
  const attempt = entry.progress.last;
  const per = attempt?.perQuestion ?? [];
  const scored = per.filter((question) => question.correct !== null);
  const total = attempt?.objectiveCount ?? scored.length;
  if (!total) return { total: 0, correct: 0 };
  if (scored.length) return { total: scored.length, correct: scored.filter((question) => question.correct === true).length };
  return { total, correct: attempt?.correctCount ?? 0 };
}

export function hasObjectiveAttempt(entry: ProgressEntry): boolean {
  return objectiveScores(entry).total > 0;
}

/** 单条成绩档案 → 薄弱统计（不做阈值过滤，过滤在 selectWeakPoints 里做）。 */
export function toWeakPoint(entry: ProgressEntry): WeakPoint {
  const { subjectId, categoryId, chapterId, progress } = entry;
  const per = progress.last?.perQuestion ?? [];
  const objective = per.filter((q) => q.correct !== null);
  const stats = objectiveScores(entry);
  const wrongCount = objective.length
    ? objective.filter((q) => q.correct === false).length
    : Math.max(0, stats.total - stats.correct);
  const answeredCount = stats.total;
  const lastPercent = progress.last?.objectiveAccuracy
    ?? (stats.total > 0 ? Math.round((stats.correct / stats.total) * 1000) / 10 : 0);
  // weakness：得分越低越薄弱（1 - percent/100），错题占比作为加权微调。
  const scoreGap = Math.max(0, 1 - lastPercent / 100);
  const wrongRatio = answeredCount > 0 ? wrongCount / answeredCount : scoreGap;
  const weakness = Math.round((scoreGap * 0.7 + wrongRatio * 0.3) * 100) / 100;
  return {
    subjectId,
    ...(categoryId ? { categoryId } : {}),
    chapterId,
    chapterLabel: chapterLabel(chapterId),
    lastPercent,
    best: progress.best ?? 0,
    wrongCount,
    answeredCount,
    weakness,
  };
}

export interface SelectWeakPointsOptions {
  /** 只取最近得分严格低于此值的章节；默认 WEAK_PERCENT_THRESHOLD。 */
  threshold?: number;
  /** 返回的最大条目数；默认 6。 */
  limit?: number;
}

function hasAnswered(entry: ProgressEntry): boolean {
  return hasObjectiveAttempt(entry);
}

/**
 * 从全部成绩档案中挑出薄弱章节，按薄弱程度降序（并列时错题多的在前）。
 * 只保留有实际作答记录的章节。
 */
export function selectWeakPoints(
  entries: ProgressEntry[],
  options: SelectWeakPointsOptions = {},
): WeakPoint[] {
  const threshold = options.threshold ?? WEAK_PERCENT_THRESHOLD;
  const limit = options.limit ?? 6;
  return entries
    .filter(hasAnswered)
    .map(toWeakPoint)
    .filter((w) => w.lastPercent < threshold)
    .sort((a, b) => b.weakness - a.weakness || b.wrongCount - a.wrongCount)
    .slice(0, limit);
}

/** 薄弱统计概览：供掌握度面板展示。 */
export interface WrongQuestionOverview {
  /** 参与统计的已作答章节数。 */
  chapters: number;
  /** 薄弱章节数（低于阈值）。 */
  weakChapters: number;
  /** 最近作答的平均正确率（百分制，一位小数）；无数据为 0。 */
  recentAccuracy: number;
  /** 最弱的若干章。 */
  weakPoints: WeakPoint[];
}

export function summarizeWrongQuestions(
  entries: ProgressEntry[],
  options: SelectWeakPointsOptions = {},
): WrongQuestionOverview {
  const answered = entries.filter(hasAnswered);
  const weakPoints = selectWeakPoints(entries, options);
  const recentAccuracy = answered.length
    ? Math.round((answered.reduce((sum, entry) => sum + toWeakPoint(entry).lastPercent, 0) / answered.length) * 10) / 10
    : 0;
  return {
    chapters: answered.length,
    weakChapters: weakPoints.length,
    recentAccuracy,
    weakPoints,
  };
}

/**
 * Describe legacy chapter-level summaries without presenting them as recoverable wrong questions.
 * The typed Review generation API still requires original question snapshots for diagnosis.
 */
export function buildWrongQuestionPrompt(weakPoints: WeakPoint[], subjectName?: (id: string) => string): string {
  if (weakPoints.length === 0) {
    return "目前没有可恢复的原题或章节资料，不能据此诊断错题。请先提供具体题目快照，或选择章节并读取该章节的真实学习资料。";
  }
  const lines = weakPoints.map((w) => {
    const name = subjectName ? subjectName(w.subjectId) : w.subjectId;
    const gap =
      w.answeredCount > 0
        ? `（最近 ${w.wrongCount}/${w.answeredCount} 题答错，得分 ${w.lastPercent} 分）`
        : `（最近得分 ${w.lastPercent} 分）`;
    return `- ${name} · ${w.chapterLabel}${gap}`;
  });
  return (
    "以下只是章节级成绩摘要，不含原题题干、选项或回答，不能据此声称掌握具体错题。" +
    "请先读取所选章节的真实学习资料；若没有资料，不要按章节名猜题：\n" +
    lines.join("\n") +
    "\n\n有实际资料后，出一套有出处的练习题，每题注明资料依据并提供解析。"
  );
}
