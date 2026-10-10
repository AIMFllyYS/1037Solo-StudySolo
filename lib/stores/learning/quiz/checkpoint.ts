import type { ReviewQuizAttempt, ReviewQuestionResult } from "@/lib/review-mode/attemptTypes";

import { prepareReviewAttemptCheckpoint, savePreparedReviewAttempt } from "@/lib/review-mode/progressSync";

import type { StoreApi } from 'zustand';
import type { QuizState } from './contracts';
import { buildAttempt } from './model';
export function createQuizCheckpoint(set: StoreApi<QuizState>['setState'], get: StoreApi<QuizState>['getState']) {

  const checkpoint = (state: QuizState) => {
    if (!state.data || !state.reviewAttempt || !state.quizSet) return;
    const base = state.reviewAttempt;
    const localResults: ReviewQuestionResult[] = state.results.map((result) => ({
      id: result.question.id,
      questionKey: `ssq-v1:${base.contentHash}:${encodeURIComponent(result.question.id)}`,
      awarded: result.awarded,
      max: result.max,
      correct: result.objective ? result.correct : null,
      objective: result.objective,
      scored: result.objective || result.selfScored,
    }));
    const scoreAttempt = state.results.length ? buildAttempt(state, state.phase === "summary" ? "final" : "submitted") : null;
    const attempt: ReviewQuizAttempt = {
      ...base,
      ownerId: base.ownerId,
      sourceKind: state.sourceKind,
      subjectId: state.subjectId,
      categoryId: state.categoryId || null,
      chapterId: state.chapterId,
      quizId: state.quizId,
      title: state.quizSet.title,
      phase: state.phase,
      stage: state.phase === "answering" ? null : state.phase === "summary" ? "final" : "submitted",
      answers: state.answers,
      currentIndex: state.currentIndex,
      revealedQuestionIds: state.results.map((result) => result.question.id),
      hintsUsed: state.hintsUsed,
      selfScores: scoreAttempt?.selfScores ?? {},
      questionResults: localResults,
      score: {
        earned: scoreAttempt?.earned ?? 0,
        max: scoreAttempt?.max ?? 0,
        percent: scoreAttempt?.percent ?? null,
        objectiveCount: scoreAttempt?.objectiveCount ?? 0,
        correctCount: scoreAttempt?.correctCount ?? 0,
        scoredCount: scoreAttempt?.scoredCount ?? 0,
      },
      completedAt: state.phase === "summary" ? base.completedAt ?? new Date().toISOString() : null,
    };
    const next = prepareReviewAttemptCheckpoint(attempt, base.ownerId);
    set({ reviewAttempt: next });
    void savePreparedReviewAttempt(next, base.ownerId).then(() => {
      if (get().reviewAttempt?.attemptId === next.attemptId && get().reviewAttempt?.revision === next.revision) set({ persistenceError: null });
    }).catch((error: unknown) => {
      if (get().reviewAttempt?.attemptId !== next.attemptId || get().reviewAttempt?.revision !== next.revision) return;
      set({ persistenceError: error instanceof Error && error.message === "REVIEW_OWNER_CHANGED" ? "owner-changed" : "local-save-failed" });
    });
  };
  return checkpoint;
}
