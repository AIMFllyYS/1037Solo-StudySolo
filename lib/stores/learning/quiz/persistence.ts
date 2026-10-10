import { saveSession } from "@/lib/quiz-progress";

import type { QuizState } from "./contracts";
import { buildSelfScores } from "./model";
/** 将当前做题状态持久化到 localStorage（覆盖式，仅保留一份最新）。 */
export function persistSession(state: QuizState): void {
  if (!state.subjectId || !state.chapterId || state.status !== "ready") return;
  saveSession(state.subjectId, state.chapterId, {
    answers: state.answers,
    phase: state.phase,
    currentIndex: state.currentIndex,
    hintsUsed: state.hintsUsed,
    selfScores: buildSelfScores(state.results),
    savedAt: new Date().toISOString(),
    attemptId: state.attemptId,
    quizId: state.quizId,
    categoryId: state.categoryId,
    sourceKind: state.sourceKind,
  });
}