import { createHash } from "node:crypto";

import { z } from "zod";
import { readQuiz } from "@/lib/content/loader";

import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import type { QuizData, QuizQuestion } from "@/lib/quiz/types";
import { canonicalJson, questionLocationKey } from "@/lib/review-mode/quizSnapshot";

import { ReviewProgressError } from "./errors";
import { SOURCE_KINDS, MAX_QUIZ_SNAPSHOT_BYTES, byteLength } from "./limits";
import { quizDataSchema, attemptBaseSchema } from "./schemas";
export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function derivedUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function createQuizKey(sourceKind: typeof SOURCE_KINDS[number], subjectId: string, categoryId: string | null, chapterId: string, quizId: string, contentHash: string): string {
  // The canonical hash includes every source locator and the full snapshot.
  void subjectId; void categoryId; void chapterId; void quizId;
  return `ss-review-v1|${sourceKind}|${contentHash}`;
}

export function safeRow(row: Record<string, unknown>, quizData?: QuizData | null, includeFullLegacy = false, includeAttemptState = false) {
  const legacy = row.legacy_data && typeof row.legacy_data === "object" ? row.legacy_data as Record<string, unknown> : null;
  const legacyLast = legacy?.last && typeof legacy.last === "object" ? legacy.last as Record<string, unknown> : null;
  return {
    attemptId: row.attempt_id,
    attemptKind: row.attempt_kind,
    quizSetId: row.quiz_set_id,
    sourceKind: row.source_kind,
    subjectId: row.subject_id,
    categoryId: row.category_id,
    chapterId: row.chapter_id,
    quizId: row.quiz_id,
    title: row.title,
    phase: row.phase,
    stage: row.stage,
    ...(includeAttemptState ? {
      answers: row.answers,
      currentIndex: row.current_index,
      revealedQuestionIds: row.revealed_question_ids,
      hintsUsed: row.hints_used,
      selfScores: row.self_scores,
    } : {}),
    questionResults: row.question_results,
    score: {
      earned: row.earned,
      max: row.max_score,
      percent: row.percent,
      objectiveCount: row.objective_count,
      correctCount: row.correct_count,
    },
    ...(legacy ? {
      legacyData: includeFullLegacy ? legacy : {
        version: legacy.version,
        best: legacy.best,
        attempts: legacy.attempts,
        last: legacyLast ? {
          percent: legacyLast.percent,
          completedAt: legacyLast.completedAt,
          stage: legacyLast.stage,
        } : null,
      },
    } : {}),
    revision: row.revision,
    operationId: row.operation_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(quizData ? { quizData } : {}),
  };
}

export function prepareQuizSet(input: z.infer<typeof quizDataSchema>, source: { sourceKind: typeof SOURCE_KINDS[number]; subjectId: string; categoryId: string | null; chapterId: string; quizId: string; title: string }) {
  if (input.subjectId !== source.subjectId || input.chapterId !== source.chapterId) throw new ReviewProgressError(400, "QUIZ_SNAPSHOT_SCOPE_MISMATCH");
  const bytes = byteLength(input);
  if (bytes > MAX_QUIZ_SNAPSHOT_BYTES) throw new ReviewProgressError(413, "QUIZ_SNAPSHOT_TOO_LARGE");
  let quizData = input;
  if (source.sourceKind === "static") {
    const bank = readQuiz(source.subjectId, source.chapterId);
    const bankResult = quizDataSchema.safeParse(bank);
    if (!bankResult.success || canonicalJson(bankResult.data) !== canonicalJson(input)) {
      throw new ReviewProgressError(409, "STATIC_QUIZ_CHANGED");
    }
    quizData = bankResult.data;
  }
  const identity = {
    sourceKind: source.sourceKind,
    subjectId: source.subjectId,
    categoryId: source.categoryId,
    chapterId: source.chapterId,
    quizId: source.quizId,
    title: source.title,
    quizData,
  };
  const contentHash = hash(canonicalJson(identity));
  const quizKey = createQuizKey(source.sourceKind, source.subjectId, source.categoryId, source.chapterId, source.quizId, contentHash);
  if (quizKey.length > 320) throw new ReviewProgressError(400, "QUIZ_KEY_TOO_LARGE");
  return { quizData, quizKey, contentHash };
}

export function calculateResults(attempt: z.infer<typeof attemptBaseSchema>, quizData: QuizData, contentHash: string) {
  if (attempt.phase === "answering") {
    return { questionResults: [], score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 } };
  }
  const isReview = attempt.sourceKind !== "static";
  const revealed = new Set(attempt.revealedQuestionIds);
  const questionResults = quizData.questions.map((question) => {
    const objective = isObjectivelyGradableQuestion(question);
    const shouldScore = objective
      ? !isReview || revealed.has(question.id) || Object.hasOwn(attempt.answers, question.id)
      : Object.hasOwn(attempt.selfScores, question.id);
    const max = maxPointsOf(question);
    if (objective && shouldScore) {
      const [awarded, correct] = autoGrade(question as QuizQuestion, attempt.answers[question.id] ?? null);
      return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded, max, correct, objective, scored: true };
    }
    if (objective) return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded: 0, max, correct: null, objective, scored: false };
    const awarded = shouldScore ? Math.min(max, attempt.selfScores[question.id] ?? 0) : 0;
    return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded, max, correct: null, objective, scored: shouldScore };
  });
  const scored = questionResults.filter((row) => row.scored);
  const objectiveRows = questionResults.filter((row) => row.objective && row.correct !== null);
  const earned = scored.reduce((sum, row) => sum + row.awarded, 0);
  const max = scored.reduce((sum, row) => sum + row.max, 0);
  const correctCount = objectiveRows.filter((row) => row.correct === true).length;
  return {
    questionResults,
    score: {
      earned: Math.round(earned * 1000) / 1000,
      max: Math.round(max * 1000) / 1000,
      percent: max > 0 ? Math.round((earned / max) * 1000) / 10 : null,
      objectiveCount: objectiveRows.length,
      correctCount,
      scoredCount: scored.length,
    },
  };
}

export function normalizeRpcResult(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new ReviewProgressError(503, "REVIEW_PROGRESS_STORAGE_UNAVAILABLE");
  const record = row as Record<string, unknown>;
  if (record.status === "conflict") {
    throw new ReviewProgressError(409, "REVIEW_ATTEMPT_STALE");
  }
  if (record.status !== "saved" || typeof record.attemptId !== "string" || !Number.isSafeInteger(record.revision)) {
    throw new ReviewProgressError(503, "REVIEW_PROGRESS_STORAGE_UNAVAILABLE");
  }
  return {
    attemptId: record.attemptId,
    revision: record.revision,
    operationId: record.operationId,
    quizSetId: record.quizSetId,
    updatedAt: record.updatedAt,
  };
}
