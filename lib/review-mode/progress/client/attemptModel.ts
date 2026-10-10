import { getStorageOwner } from "@/lib/storage/ownerScope";

import type { ReviewQuizAttempt, ReviewQuizSet } from "../../attemptTypes";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createReviewAttempt(set: ReviewQuizSet, ownerId = getStorageOwner()): ReviewQuizAttempt {
  const now = new Date().toISOString();
  return {
    ownerId,
    attemptId: uuid(),
    attemptKind: "quiz",
    sourceKind: set.sourceKind,
    subjectId: set.subjectId,
    categoryId: set.categoryId,
    chapterId: set.chapterId,
    quizId: set.quizId,
    title: set.title,
    quizKey: set.quizKey,
    contentHash: set.contentHash,
    quizSetId: null,
    phase: "answering",
    stage: null,
    answers: {},
    currentIndex: 0,
    revealedQuestionIds: [],
    hintsUsed: [],
    selfScores: {},
    questionResults: [],
    score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 },
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    serverRevision: 0,
    syncedRevision: -1,
    seedOperationId: uuid(),
    operationId: uuid(),
    syncState: ownerId ? "pending" : "local-only",
  };
}

export function isBlankAnswering(attempt: ReviewQuizAttempt): boolean {
  return attempt.phase === "answering" && attempt.stage === null
    && attempt.currentIndex === 0
    && Object.keys(attempt.answers).length === 0 && attempt.revealedQuestionIds.length === 0
    && attempt.hintsUsed.length === 0 && Object.keys(attempt.selfScores).length === 0;
}

export function requestAttempt(attempt: ReviewQuizAttempt, expectedRevision: number) {
  return {
    attemptId: attempt.attemptId,
    expectedRevision,
    operationId: attempt.operationId,
    sourceKind: attempt.sourceKind,
    subjectId: attempt.subjectId,
    categoryId: attempt.categoryId,
    chapterId: attempt.chapterId,
    quizId: attempt.quizId,
    title: attempt.title,
    phase: attempt.phase,
    stage: attempt.stage,
    answers: attempt.answers,
    currentIndex: attempt.currentIndex,
    revealedQuestionIds: attempt.revealedQuestionIds,
    hintsUsed: attempt.hintsUsed,
    selfScores: attempt.selfScores,
    completedAt: attempt.completedAt,
  };
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function serverAttempt(value: Record<string, unknown>): ReviewQuizAttempt | null {
  const quizData = value.quizData as ReviewQuizSet["quizData"] | undefined;
  if (!quizData || typeof value.attemptId !== "string" || typeof value.quizKey !== "string"
    || typeof value.contentHash !== "string" || !Number.isSafeInteger(value.revision)) return null;
  const score = value.score && typeof value.score === "object" ? value.score as Record<string, unknown> : {};
  const numeric = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const sourceKind = value.sourceKind;
  if (sourceKind !== "static" && sourceKind !== "review-wrong" && sourceKind !== "review-chapter" && sourceKind !== "classroom") return null;
  const serverRevision = numeric(value.revision);
  return {
    ownerId: getStorageOwner(),
    attemptId: value.attemptId,
    attemptKind: "quiz",
    sourceKind,
    subjectId: asString(value.subjectId),
    categoryId: typeof value.categoryId === "string" ? value.categoryId : null,
    chapterId: asString(value.chapterId),
    quizId: asString(value.quizId),
    title: asString(value.title),
    quizKey: value.quizKey,
    contentHash: value.contentHash,
    quizSetId: asString(value.quizSetId) || null,
    phase: value.phase === "scoring" || value.phase === "summary" ? value.phase : "answering",
    stage: value.stage === "submitted" || value.stage === "final" ? value.stage : null,
    answers: value.answers && typeof value.answers === "object" ? value.answers as ReviewQuizAttempt["answers"] : {},
    currentIndex: numeric(value.currentIndex),
    revealedQuestionIds: Array.isArray(value.revealedQuestionIds) ? value.revealedQuestionIds.filter((id): id is string => typeof id === "string") : [],
    hintsUsed: Array.isArray(value.hintsUsed) ? value.hintsUsed.filter((id): id is string => typeof id === "string") : [],
    selfScores: value.selfScores && typeof value.selfScores === "object" ? value.selfScores as Record<string, number> : {},
    questionResults: Array.isArray(value.questionResults) ? value.questionResults as ReviewQuizAttempt["questionResults"] : [],
    score: {
      earned: numeric(score.earned), max: numeric(score.max), percent: typeof score.percent === "number" ? score.percent : null,
      objectiveCount: numeric(score.objectiveCount), correctCount: numeric(score.correctCount),
      scoredCount: Array.isArray(value.questionResults) ? value.questionResults.filter((result) => result && typeof result === "object" && result.scored === true).length : 0,
    },
    completedAt: asString(value.completedAt) || null,
    createdAt: asString(value.createdAt, new Date().toISOString()),
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    revision: serverRevision,
    serverRevision,
    syncedRevision: serverRevision,
    seedOperationId: uuid(),
    operationId: asString(value.operationId, uuid()),
    syncState: "synced",
  };
}

/** Persist locally first; cloud state is acknowledged separately and never masks a failed/offline save. */
export function prepareReviewAttemptCheckpoint(attempt: ReviewQuizAttempt, ownerId: string | null = attempt.ownerId): ReviewQuizAttempt {
  if (ownerId !== attempt.ownerId || (ownerId && ownerId !== getStorageOwner())) throw new Error("REVIEW_OWNER_CHANGED");
  const now = new Date().toISOString();
  return {
    ...attempt,
    revision: attempt.revision + 1,
    operationId: uuid(),
    updatedAt: now,
    syncState: ownerId ? "pending" : "local-only",
  };
}
