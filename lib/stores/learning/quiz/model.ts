import type { QuizQuestion, UserAnswer } from "@/lib/quiz/types";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import { type QuizAttempt } from "@/lib/quiz-progress";

import type { QuizState, QuestionResult, QuizScoreBreakdown } from "./contracts";
/** 从 results 中提取主观题自评分快照（id → awarded）。 */
export function buildSelfScores(results: QuestionResult[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const r of results) {
    if (!r.objective && r.selfScored) scores[r.question.id] = r.awarded;
  }
  return scores;
}

/**
 * 从已保存的 session 重建 results（用于恢复 scoring/summary 阶段）。
 * 客观题重新自动判分；主观题使用保存的自评分。
 */
export function rebuildResults(
  questions: QuizQuestion[],
  answers: Record<string, UserAnswer>,
  selfScores: Record<string, number>,
): QuestionResult[] {
  return questions.map((q) => {
    const answer = answers[q.id] ?? null;
    const max = maxPointsOf(q);
    const objective = isObjectivelyGradableQuestion(q);
    if (objective) {
      const [awarded, correct] = autoGrade(q, answer);
      return { question: q, answer, awarded, max, correct, objective, selfScored: false };
    }
    const selfScored = Object.hasOwn(selfScores, q.id);
    return { question: q, answer, awarded: selfScores[q.id] ?? 0, max, correct: false, objective, selfScored };
  });
}

/** 由当前 results 构造一次作答记录（用于本地持久化）。 */
export function buildAttempt(state: QuizState, stage: QuizAttempt["stage"]): QuizAttempt {
  const scored = state.results.filter((r) => r.objective || r.selfScored);
  const earned = scored.reduce((a, r) => a + r.awarded, 0);
  const max = scored.reduce((a, r) => a + r.max, 0);
  const objective = state.results.filter((r) => r.objective);
  const correctCount = objective.filter((r) => r.correct).length;
  return {
    earned,
    max,
    percent: max > 0 ? Math.round((earned / max) * 1000) / 10 : null,
    completedAt: new Date().toISOString(),
    stage,
    hintsUsed: state.hintsUsed.length,
    attemptId: state.attemptId,
    quizId: state.quizId,
    categoryId: state.categoryId || undefined,
    sourceKind: state.sourceKind,
    objectiveCount: objective.length,
    correctCount,
    scoredCount: scored.length,
    objectiveAccuracy: objective.length > 0 ? Math.round((correctCount / objective.length) * 1000) / 10 : null,
    answersSnapshot: { ...state.answers },
    selfScores: buildSelfScores(state.results),
    currentIndex: state.currentIndex,
    quizSnapshot: state.data ?? undefined,
    perQuestion: state.results.map((r) => ({
      id: r.question.id,
      awarded: r.awarded,
      max: r.max,
      correct: r.objective ? r.correct : null,
      scored: r.objective || r.selfScored,
      questionKey: JSON.stringify([state.sourceKind, state.subjectId, state.categoryId, state.chapterId, state.quizId, r.question.id]),
    })),
  };
}

export function computeBreakdown(results: QuestionResult[]): QuizScoreBreakdown {
  const acc = (
    bucket: Record<string, { earned: number; max: number; count: number }>,
    key: string,
    earned: number,
    max: number,
  ) => {
    const cur = bucket[key] ?? { earned: 0, max: 0, count: 0 };
    cur.earned += earned;
    cur.max += max;
    cur.count += 1;
    bucket[key] = cur;
  };

  const byType: QuizScoreBreakdown["byType"] = {};
  const bySource: QuizScoreBreakdown["bySource"] = {};
  const byDifficulty: QuizScoreBreakdown["byDifficulty"] = {};
  let earned = 0;
  let max = 0;

  for (const r of results) {
    earned += r.awarded;
    max += r.max;
    acc(byType, r.question.type, r.awarded, r.max);
    acc(bySource, r.question.source, r.awarded, r.max);
    acc(byDifficulty, r.question.difficulty, r.awarded, r.max);
  }

  const percent = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
  return { earned, max, percent, byType, bySource, byDifficulty };
}