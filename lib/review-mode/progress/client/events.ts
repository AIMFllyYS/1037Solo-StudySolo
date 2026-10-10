import type { ReviewQuizAttempt } from "../../attemptTypes";

type SyncSnapshot = Pick<ReviewQuizAttempt, "attemptId" | "syncState" | "revision" | "serverRevision" | "syncedRevision">;
type SyncListener = (snapshot: SyncSnapshot) => void;
const listeners = new Set<SyncListener>();

export function publish(attempt: ReviewQuizAttempt) {
  const snapshot = {
    attemptId: attempt.attemptId,
    syncState: attempt.syncState,
    revision: attempt.revision,
    serverRevision: attempt.serverRevision,
    syncedRevision: attempt.syncedRevision,
  };
  for (const listener of [...listeners]) listener(snapshot);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("studysolo:review-attempt-sync", { detail: snapshot }));
}

export function subscribeReviewAttemptSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
