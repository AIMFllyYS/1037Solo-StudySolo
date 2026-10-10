import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";

import { ReviewProgressError, mapStorageError } from "./errors";
import { safeRow, normalizeRpcResult } from "./snapshots";
import { quizDataSchema } from "./schemas";
export async function readOwnedQuizSet(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, setId: string) {
  const { data, error } = await db.from("ss_review_quiz_sets")
    .select("id,quiz_key,source_kind,subject_id,category_id,chapter_id,quiz_id,title,content_hash,quiz_data")
    .eq("user_id", ownerId).eq("id", setId).maybeSingle();
  if (error) mapStorageError(error);
  if (!data) throw new ReviewProgressError(404, "REVIEW_ATTEMPT_NOT_FOUND");
  return data as Record<string, unknown>;
}

export async function withQuizSnapshot(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, row: Record<string, unknown>) {
  if (row.attempt_kind === "legacy-summary" || typeof row.quiz_set_id !== "string") return safeRow(row, null, true);
  const set = await readOwnedQuizSet(db, ownerId, row.quiz_set_id);
  const parsed = quizDataSchema.safeParse(set.quiz_data);
  if (!parsed.success) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
  return {
    ...safeRow(row, parsed.data, false, true),
    quizKey: set.quiz_key,
    contentHash: set.content_hash,
  };
}

export async function findAttempt(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, attemptId: string) {
  const { data, error } = await db.from("ss_review_quiz_attempts")
    .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,answers,current_index,revealed_question_ids,hints_used,self_scores,question_results,earned,max_score,percent,objective_count,correct_count,legacy_data,revision,operation_id,completed_at,created_at,updated_at")
    .eq("user_id", ownerId).eq("attempt_id", attemptId).maybeSingle();
  if (error) mapStorageError(error);
  return data as Record<string, unknown> | null;
}

export async function persistAttempt(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, request: Record<string, unknown>) {
  const { data, error } = await db.rpc("ss_review_quiz_save_attempt", { p_user_id: ownerId, p_request: request });
  if (error) mapStorageError(error);
  return normalizeRpcResult(data);
}
