import type { QuizQuestion } from "@/lib/quiz/types";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import type { ReviewQuizAttempt, ReviewQuizSet } from "./attemptTypes";
import { canonicalJson, createQuizSetIdentity, questionLocationKey, sha256Hex } from "./quizSnapshot";
import { listLocalReviewAttempts } from "./attemptStorage";
import { createAndCheckpointReviewAttempt, findResumableReviewAttempt, loadLatestCompletedReviewAttempt, loadReviewAttemptById, retryReviewAttemptSync } from "./progressSync";
import { getStorageOwner } from "@/lib/storage/ownerScope";

/** Generated chat quizzes use a virtual namespace, never an actual course's grade. */
export async function agentQuizSet(title: string, questions: QuizQuestion[], quizId: string): Promise<ReviewQuizSet> {
  const stableId = /^legacy:[a-f0-9]{64}$/.test(quizId) ? quizId.slice(7)
    : await sha256Hex(quizId === "legacy" ? canonicalJson({ title, questions }) : quizId);
  const chapterId = `agent:${stableId}`;
  const source = {
    sourceKind: "review-chapter" as const, subjectId: "review", categoryId: "agent", chapterId,
    quizId: quizId === "legacy" ? `legacy:${stableId}` : quizId, title,
    quizData: {
      subjectId: "review", chapterId, generatedAt: "agent-tool",
      examConfig: { source: title, totalPoints: questions.reduce((sum, question) => sum + maxPointsOf(question), 0) },
      questions,
    },
  };
  return { ...source, ...await createQuizSetIdentity(source) };
}

export async function openAgentQuizAttempt(set: ReviewQuizSet, ownerId: string | null, fresh = false): Promise<ReviewQuizAttempt> {
  if (ownerId !== getStorageOwner()) throw new Error("REVIEW_OWNER_CHANGED");
  if (!fresh) {
    const rows = (await listLocalReviewAttempts(ownerId))
      .filter((attempt) => attempt.contentHash === set.contentHash)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (rows[0]) {
      const stored = await loadReviewAttemptById(rows[0].attemptId, ownerId);
      if (stored?.set.contentHash === set.contentHash) {
        if (ownerId && (stored.attempt.syncState === "pending" || stored.attempt.syncState === "conflict")) {
          // Tool cards may load after owner hydration. Resume this exact attempt;
          // conflict sync only confirms matching server state and never overwrites it.
          await retryReviewAttemptSync(stored.attempt).catch(() => {});
          const refreshed = await loadReviewAttemptById(stored.attempt.attemptId, ownerId);
          if (ownerId !== getStorageOwner()) throw new Error("REVIEW_OWNER_CHANGED");
          if (refreshed?.set.contentHash === set.contentHash) return refreshed.attempt;
        }
        return stored.attempt;
      }
    }
    const scope = { sourceKind: set.sourceKind, subjectId: set.subjectId, categoryId: set.categoryId, chapterId: set.chapterId };
    const stored = await findResumableReviewAttempt(scope, ownerId)
      ?? await loadLatestCompletedReviewAttempt(scope, ownerId);
    if (stored?.set.contentHash === set.contentHash) return stored.attempt;
  }
  if (ownerId !== getStorageOwner()) throw new Error("REVIEW_OWNER_CHANGED");
  return createAndCheckpointReviewAttempt(set, ownerId);
}

/** Mirrors the existing Review scorer: unattempted and subjective questions aren't fabricated misses. */
export function completeAgentQuizAttempt(attempt: ReviewQuizAttempt, questions: QuizQuestion[]): ReviewQuizAttempt {
  const revealed = new Set(attempt.revealedQuestionIds);
  const questionResults = questions.map((question) => {
    const objective = isObjectivelyGradableQuestion(question);
    const scored = objective
      ? attempt.sourceKind === "static" || revealed.has(question.id) || Object.hasOwn(attempt.answers, question.id)
      : Object.hasOwn(attempt.selfScores, question.id);
    const max = maxPointsOf(question);
    const [awarded, correct] = objective && scored ? autoGrade(question, attempt.answers[question.id] ?? null)
      : [scored ? Math.min(max, attempt.selfScores[question.id] ?? 0) : 0, null];
    return { id: question.id, questionKey: questionLocationKey(attempt.contentHash!, question.id), awarded, max, correct, objective, scored };
  });
  const scored = questionResults.filter((result) => result.scored);
  const objectiveRows = questionResults.filter((result) => result.objective && result.correct !== null);
  const earned = scored.reduce((sum, result) => sum + result.awarded, 0);
  const max = scored.reduce((sum, result) => sum + result.max, 0);
  return {
    ...attempt, phase: "summary", stage: "final", completedAt: new Date().toISOString(), questionResults,
    score: { earned: Math.round(earned * 1000) / 1000, max: Math.round(max * 1000) / 1000, percent: max ? Math.round(earned / max * 1000) / 10 : null, objectiveCount: objectiveRows.length, correctCount: objectiveRows.filter((result) => result.correct === true).length, scoredCount: scored.length },
  };
}
