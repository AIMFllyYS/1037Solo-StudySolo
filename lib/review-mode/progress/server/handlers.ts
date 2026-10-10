import type { NextRequest } from "next/server";

import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";

import type { QuizData } from "@/lib/quiz/types";

import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
import { ReviewProgressError, reply, fail, mapStorageError } from "./errors";
import { ownerFor, assertExpectedOwnerBinding, assertReviewOrigin, readBody } from "./auth";
import { postSchema, readQuery, quizDataSchema } from "./schemas";
import { RESPONSE_BYTES_SOFT_LIMIT, MAX_REQUEST_BYTES, byteLength } from "./limits";
import { safeRow, derivedUuid, prepareQuizSet, calculateResults } from "./snapshots";
import { readOwnedQuizSet, withQuizSnapshot, findAttempt, persistAttempt } from "./repository";
export async function GET(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) {
    try { return await forwardDesktopAgentRequest(request); } catch (error) { return sandboxFailure(error); }
  }
  try {
    assertReviewOrigin(request, false);
    const ownerId = await ownerFor(request);
    const query = readQuery(request);
    const db = createServiceAuthClient();
    if (query.attemptId) {
      const row = await findAttempt(db, ownerId, query.attemptId);
      if (!row) throw new ReviewProgressError(404, "REVIEW_ATTEMPT_NOT_FOUND");
      return reply(await withQuizSnapshot(db, ownerId, row));
    }

    if (query.view === "resume") {
      let builder = db.from("ss_review_quiz_attempts")
        .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,answers,current_index,revealed_question_ids,hints_used,self_scores,question_results,earned,max_score,percent,objective_count,correct_count,legacy_data,revision,operation_id,completed_at,created_at,updated_at")
        .eq("user_id", ownerId).eq("attempt_kind", "quiz").neq("phase", "summary")
        .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1);
      if (query.sourceKind) builder = builder.eq("source_kind", query.sourceKind);
      if (query.subjectId) {
        builder = builder.eq("subject_id", query.subjectId).eq("chapter_id", query.chapterId);
        if (query.categoryId) builder = builder.eq("category_id", query.categoryId);
      }
      const { data, error } = await builder;
      if (error) mapStorageError(error);
      const row = data?.[0] as Record<string, unknown> | undefined;
      return reply(row ? await withQuizSnapshot(db, ownerId, row) : { attempt: null });
    }

    let cursorCreatedAt: string | null = null;
    if (query.cursor) {
      const cursorRow = await db.from("ss_review_quiz_attempts").select("id,created_at")
        .eq("user_id", ownerId).eq("id", query.cursor).maybeSingle();
      if (cursorRow.error) mapStorageError(cursorRow.error);
      if (typeof cursorRow.data?.created_at !== "string") throw new ReviewProgressError(400, "INVALID_CURSOR");
      cursorCreatedAt = cursorRow.data.created_at;
    }
    let builder = db.from("ss_review_quiz_attempts")
      .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,question_results,legacy_data,earned,max_score,percent,objective_count,correct_count,revision,operation_id,completed_at,created_at,updated_at")
      .eq("user_id", ownerId);
    if (cursorCreatedAt && query.cursor) {
      const escapedTimestamp = cursorCreatedAt.replaceAll(",", "");
      builder = builder.or(`created_at.lt.${escapedTimestamp},and(created_at.eq.${escapedTimestamp},id.lt.${query.cursor})`);
    }
    builder = builder.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(query.limit + 1);
    if (query.sourceKind) builder = builder.eq("source_kind", query.sourceKind);
    if (query.subjectId) {
      builder = builder.eq("subject_id", query.subjectId).eq("chapter_id", query.chapterId);
      if (query.categoryId) builder = builder.eq("category_id", query.categoryId);
    }
    const { data, error } = await builder;
    if (error) mapStorageError(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const page: Array<Record<string, unknown>> = [];
    for (const row of rows.slice(0, query.limit)) {
      const candidate = { ...safeRow(row, null), cursor: row.id };
      if (page.length && byteLength({ rows: [...page, candidate], nextCursor: null }) > RESPONSE_BYTES_SOFT_LIMIT) break;
      page.push(candidate);
    }
    const hasMore = rows.length > page.length;
    const nextCursor = hasMore ? String(page.at(-1)?.cursor ?? "") || null : null;
    return reply({ rows: page, nextCursor });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) {
    try { return await forwardDesktopAgentRequest(request); } catch (error) { return sandboxFailure(error); }
  }
  try {
    assertReviewOrigin(request, true);
    const ownerId = await ownerFor(request);
    assertExpectedOwnerBinding(request, ownerId);
    const raw = await readBody(request);
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) throw new ReviewProgressError(400, "INVALID_REVIEW_PROGRESS");
    const body = parsed.data;
    const db = createServiceAuthClient();

    if (body.action === "import-legacy") {
      const entry = body.entry;
      let priorQuery = db.from("ss_review_quiz_attempts")
        .select("attempt_id,revision,operation_id")
        .eq("user_id", ownerId).eq("attempt_kind", "legacy-summary")
        .eq("subject_id", entry.subjectId).eq("chapter_id", entry.chapterId);
      priorQuery = entry.categoryId === null ? priorQuery.is("category_id", null) : priorQuery.eq("category_id", entry.categoryId);
      const prior = await priorQuery.maybeSingle();
      if (prior.error) mapStorageError(prior.error);
      const attemptId = derivedUuid(`${ownerId}|legacy-summary|${entry.subjectId}|${entry.categoryId ?? ""}|${entry.chapterId}`);
      const operationId = derivedUuid(`${ownerId}|legacy-import|${body.importId}|${entry.subjectId}|${entry.categoryId ?? ""}|${entry.chapterId}`);
      const objectiveRows = entry.progress.last.perQuestion?.filter((item) => item.correct !== null) ?? [];
      const correctCount = objectiveRows.filter((item) => item.correct === true).length;
      const legacyData = { version: 1, best: entry.progress.best, attempts: entry.progress.attempts, last: entry.progress.last };
      const requestData: Record<string, unknown> = {
        attemptId,
        // Keep a deterministic importId replay byte-for-byte identical so the RPC's
        // operation-hash check can distinguish a retry from a new import payload.
        expectedRevision: prior.data?.operation_id === operationId ? 0 : prior.data?.revision ?? 0,
        operationId,
        attemptKind: "legacy-summary",
        sourceKind: "legacy-import",
        subjectId: entry.subjectId,
        categoryId: entry.categoryId,
        chapterId: entry.chapterId,
        quizId: "legacy-import-v1",
        title: entry.title,
        phase: "summary",
        stage: "final",
        currentIndex: 0,
        score: {
          earned: entry.progress.last.earned,
          max: entry.progress.last.max,
          percent: entry.progress.last.max > 0 ? entry.progress.last.percent : null,
          objectiveCount: objectiveRows.length,
          correctCount,
          scoredCount: entry.progress.last.perQuestion?.filter((item) => item.correct !== null || item.awarded > 0).length ?? 0,
        },
        questionResults: (entry.progress.last.perQuestion ?? []).map((item) => ({ ...item })),
        legacyData,
        completedAt: entry.progress.last.completedAt || null,
      };
      const saved = await persistAttempt(db, ownerId, requestData);
      return reply(saved);
    }

    const attempt = body.attempt;
    if (body.action === "seed-attempt" && (attempt.expectedRevision !== 0 || attempt.phase !== "answering" || attempt.stage !== null
      || Object.keys(attempt.answers).length > 0 || attempt.revealedQuestionIds.length > 0 || attempt.hintsUsed.length > 0)) {
      throw new ReviewProgressError(400, "INVALID_REVIEW_ATTEMPT_SEED");
    }
    let quizData: QuizData | null = null;
    let quizKey = "";
    let contentHash = "";
    let quizSetId: string | null = null;

    if (body.action === "seed-attempt") {
      const prepared = prepareQuizSet(body.attempt.quizData, attempt);
      quizData = prepared.quizData;
      quizKey = prepared.quizKey;
      contentHash = prepared.contentHash;
    } else {
      const set = await readOwnedQuizSet(db, ownerId, body.attempt.quizSetId);
      if (set.source_kind !== attempt.sourceKind || set.subject_id !== attempt.subjectId
        || set.category_id !== attempt.categoryId || set.chapter_id !== attempt.chapterId || set.quiz_id !== attempt.quizId) {
        throw new ReviewProgressError(409, "REVIEW_QUIZ_SNAPSHOT_CONFLICT");
      }
      const validatedSet = quizDataSchema.safeParse(set.quiz_data);
      if (!validatedSet.success) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
      quizData = validatedSet.data;
      quizKey = String(set.quiz_key);
      contentHash = String(set.content_hash);
      quizSetId = String(set.id);
    }

    if (!quizData) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
    const { questionResults, score } = calculateResults(attempt, quizData, contentHash);
    const rpcRequest = {
      attemptId: attempt.attemptId,
      expectedRevision: attempt.expectedRevision,
      operationId: attempt.operationId,
      attemptKind: "quiz",
      sourceKind: attempt.sourceKind,
      subjectId: attempt.subjectId,
      categoryId: attempt.categoryId,
      chapterId: attempt.chapterId,
      quizId: attempt.quizId,
      title: attempt.title,
      quizKey,
      contentHash,
      ...(body.action === "seed-attempt" ? { quizData } : { quizSetId }),
      phase: attempt.phase,
      stage: attempt.stage,
      answers: attempt.answers,
      currentIndex: attempt.currentIndex,
      revealedQuestionIds: attempt.revealedQuestionIds,
      hintsUsed: attempt.hintsUsed,
      selfScores: attempt.selfScores,
      questionResults,
      score,
      completedAt: attempt.completedAt,
    };
    if (byteLength(rpcRequest) > MAX_REQUEST_BYTES) throw new ReviewProgressError(413, "REVIEW_PROGRESS_BODY_TOO_LARGE");
    const saved = await persistAttempt(db, ownerId, rpcRequest);
    return reply({ ...saved, quizKey, contentHash, score, questionResults });
  } catch (error) {
    return fail(error);
  }
}
