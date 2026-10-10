import { getStorageOwner } from "@/lib/storage/ownerScope";
import { getLocalReviewAttempt, saveLocalReviewAttempt } from "../../attemptStorage";
import type { ReviewQuizAttempt } from "../../attemptTypes";

const localWriteQueues = new Map<string, Promise<unknown>>();

export function queueLocalWrite<T>(ownerId: string | null, attemptId: string, write: () => Promise<T>): Promise<T> {
  const key = `${ownerId ?? "guest"}:${attemptId}`;
  const previous = localWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  localWriteQueues.set(key, next);
  return next.finally(() => { if (localWriteQueues.get(key) === next) localWriteQueues.delete(key); });
}

export function retainAcknowledgedMetadata(attempt: ReviewQuizAttempt, existing: ReviewQuizAttempt | null): ReviewQuizAttempt {
  if (!existing) return attempt;
  return {
    ...attempt,
    quizSetId: existing.quizSetId ?? attempt.quizSetId,
    serverRevision: Math.max(existing.serverRevision, attempt.serverRevision),
    syncedRevision: Math.max(existing.syncedRevision, attempt.syncedRevision),
  };
}

export async function saveMetadata(attempt: ReviewQuizAttempt, ownerId: string, isCurrent: () => boolean): Promise<boolean> {
  return queueLocalWrite(ownerId, attempt.attemptId, async () => {
    if (!isCurrent() || ownerId !== getStorageOwner()) return false;
    const existing = await getLocalReviewAttempt(attempt.attemptId, ownerId);
    if (!isCurrent() || ownerId !== getStorageOwner()) return false;
    const base = existing && existing.revision > attempt.revision ? existing : attempt;
    const next = retainAcknowledgedMetadata(base, attempt);
    const syncedRevision = Math.max(existing?.syncedRevision ?? -1, attempt.syncedRevision);
    return saveLocalReviewAttempt({
      ...retainAcknowledgedMetadata(next, existing),
      syncedRevision,
      syncState: attempt.syncState === "conflict" ? "conflict" : syncedRevision >= base.revision ? "synced" : "pending",
    }, ownerId);
  });
}
