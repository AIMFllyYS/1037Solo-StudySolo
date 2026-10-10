import { post, getAttempt, requestAttemptsPage } from "./progress/client/client";
import { isBlankAnswering, requestAttempt, asString, serverAttempt, prepareReviewAttemptCheckpoint, createReviewAttempt } from "./progress/client/attemptModel";
import { publish } from "./progress/client/events";
import { saveMetadata, queueLocalWrite, retainAcknowledgedMetadata } from "./progress/client/checkpoint";
import { mergeServerScore } from "./progress/client/scoreProjection";
export { subscribeReviewAttemptSync } from "./progress/client/events";
export { createReviewAttempt } from "./progress/client/attemptModel";
export { prepareReviewAttemptCheckpoint } from "./progress/client/attemptModel";
export { importLegacyEntries } from "./progress/client/legacyImport";
export { importLegacyLocalHistory } from "./progress/client/legacyImport";
import {
  captureStorageOperation,
  getStorageOwner,
  getOwnerEpoch,
  onStorageOwnerChange,
  registerOwnerHydrator,
} from "@/lib/storage/ownerScope";
import {
  getLocalQuizSet,
  getLocalReviewAttempt,
  listLocalReviewAttempts,
  saveLocalQuizSet,
  saveLocalReviewAttempt,
} from "./attemptStorage";
import type { ReviewQuizAttempt, ReviewQuizSet } from "./attemptTypes";
import { canonicalJson } from "./quizSnapshot";

const queues = new Map<string, Promise<unknown>>();
const scheduledSyncs = new Map<string, { timer: ReturnType<typeof setTimeout>; waiters: Array<() => void> }>();

async function syncLatest(ownerId: string, attemptId: string): Promise<void> {
  let captured;
  try { captured = captureStorageOperation(attemptId); } catch { return; }
  if (captured.ownerId !== ownerId) return;

  for (let pass = 0; pass < 4 && captured.isCurrent(); pass++) {
    const attempt = await getLocalReviewAttempt(attemptId, ownerId);
    if (!attempt || !captured.isCurrent()) return;
    // A queued duplicate after a successful ACK must not reuse the same operation
    // with a different expectedRevision (the RPC hashes the complete request).
    if (attempt.quizSetId && attempt.syncState === "synced" && attempt.syncedRevision >= attempt.revision) return;
    if (attempt.syncState === "conflict" || attempt.syncedRevision >= attempt.revision) {
      const value = await getAttempt(attemptId, captured.signal).catch(() => null);
      if (!value || !captured.isCurrent()) return;
      const remote = serverAttempt(value);
      if (!remote) return;
      const stateOf = (row: ReviewQuizAttempt) => ({
        ...requestAttempt(row, 0), operationId: null, contentHash: row.contentHash, quizSetId: row.quizSetId,
        completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      });
      const localState = stateOf(attempt), remoteState = stateOf(remote);
      if (canonicalJson(localState) === canonicalJson(remoteState)) {
        const confirmed = { ...attempt, serverRevision: remote.serverRevision, syncedRevision: attempt.revision, syncState: "synced" as const };
        await saveMetadata(confirmed, ownerId, captured.isCurrent);
        publish(confirmed);
      } else if (attempt.syncState !== "conflict") {
        const conflict = { ...attempt, syncState: "conflict" as const };
        await saveMetadata(conflict, ownerId, captured.isCurrent);
        publish(conflict);
      }
      return;
    }
    const set = await getLocalQuizSet(attempt.contentHash ?? "", ownerId);
    if (!set || !captured.isCurrent()) return;
    let current = attempt;
    try {
      if (!current.quizSetId) {
        const seedState = {
          ...current,
          phase: "answering" as const,
          stage: null,
          answers: {},
          currentIndex: 0,
          revealedQuestionIds: [],
          hintsUsed: [],
          selfScores: {},
          completedAt: null,
        };
        const result = await post({ action: "seed-attempt", attempt: {
          ...requestAttempt(seedState, 0),
          operationId: current.seedOperationId,
          quizSetId: null,
          quizData: set.quizData,
        } }, captured.signal, ownerId);
        if (!captured.isCurrent()) return;
        if (typeof result.quizSetId !== "string" || !Number.isSafeInteger(result.revision)) throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
        current = {
          ...current,
          quizSetId: result.quizSetId,
          serverRevision: Number(result.revision),
          syncedRevision: isBlankAnswering(current) ? current.revision : current.syncedRevision,
          syncState: isBlankAnswering(current) ? "synced" : "pending",
        };
        if (!(await saveMetadata(current, ownerId, captured.isCurrent))) return;
        publish(current);
        if (isBlankAnswering(current)) return;
      }

      const result = await post({ action: "save-attempt", attempt: { ...requestAttempt(current, current.serverRevision), quizSetId: current.quizSetId } }, captured.signal, ownerId);
      if (!captured.isCurrent()) return;
      if (!Number.isSafeInteger(result.revision)) throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
      const latest = await getLocalReviewAttempt(attemptId, ownerId);
      if (!latest || !captured.isCurrent()) return;
      const unchanged = latest.revision === current.revision && latest.operationId === current.operationId;
      const next = {
        ...latest,
        quizSetId: current.quizSetId,
        serverRevision: Number(result.revision),
        ...(unchanged ? { syncedRevision: latest.revision, syncState: "synced" as const } : { syncState: "pending" as const }),
      };
      await saveMetadata(next, ownerId, captured.isCurrent);
      publish(next);
      if (unchanged) return;
    } catch (error) {
      if (!captured.isCurrent()) return;
      const latest = await getLocalReviewAttempt(attemptId, ownerId);
      if (!latest || latest.revision !== attempt.revision) return;
      const conflict = error instanceof Error && error.message.startsWith("CONFLICT:");
      const next = { ...latest, syncState: conflict ? "conflict" as const : "pending" as const };
      await saveMetadata(next, ownerId, captured.isCurrent);
      publish(next);
      return;
    }
  }
}

function queueSync(ownerId: string, attemptId: string): Promise<void> {
  const key = `${ownerId}:${attemptId}`;
  return new Promise((resolve) => {
    const existing = scheduledSyncs.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.waiters.push(resolve);
      existing.timer = setTimeout(() => runScheduledSync(key, ownerId, attemptId), 350);
      return;
    }
    const pending = { timer: setTimeout(() => runScheduledSync(key, ownerId, attemptId), 350), waiters: [resolve] };
    scheduledSyncs.set(key, pending);
  });
}

function runScheduledSync(key: string, ownerId: string, attemptId: string) {
  const pending = scheduledSyncs.get(key);
  if (!pending) return;
  scheduledSyncs.delete(key);
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => syncLatest(ownerId, attemptId)).finally(() => {
    if (queues.get(key) === next) queues.delete(key);
    pending.waiters.forEach((resolve) => resolve());
  });
  queues.set(key, next);
}

export async function savePreparedReviewAttempt(attempt: ReviewQuizAttempt, ownerId: string | null = attempt.ownerId): Promise<void> {
  if (ownerId !== attempt.ownerId || (ownerId && ownerId !== getStorageOwner())) throw new Error("REVIEW_OWNER_CHANGED");
  const saved = await queueLocalWrite(ownerId, attempt.attemptId, async () => {
    if (ownerId && ownerId !== getStorageOwner()) throw new Error("REVIEW_OWNER_CHANGED");
    const existing = await getLocalReviewAttempt(attempt.attemptId, ownerId);
    if (existing && existing.revision > attempt.revision) return existing;
    const next = retainAcknowledgedMetadata(attempt, existing);
    return await saveLocalReviewAttempt(next, ownerId) ? next : null;
  });
  if (!saved) throw new Error("REVIEW_LOCAL_SAVE_FAILED");
  publish(saved);
  if (ownerId) void queueSync(ownerId, attempt.attemptId);
}

export async function checkpointReviewAttempt(attempt: ReviewQuizAttempt, ownerId: string | null = attempt.ownerId): Promise<ReviewQuizAttempt> {
  const next = prepareReviewAttemptCheckpoint(attempt, ownerId);
  await savePreparedReviewAttempt(next, ownerId);
  return next;
}

export async function retryReviewAttemptSync(attempt: ReviewQuizAttempt): Promise<void> {
  if (!attempt.ownerId || attempt.ownerId !== getStorageOwner()) {
    throw new Error("REVIEW_SYNC_RETRY_UNAVAILABLE");
  }
  await queueSync(attempt.ownerId, attempt.attemptId);
}

export async function createAndCheckpointReviewAttempt(set: ReviewQuizSet, ownerId: string | null = getStorageOwner()): Promise<ReviewQuizAttempt> {
  const storedSet = await saveLocalQuizSet(set, ownerId);
  if (!storedSet) throw new Error("REVIEW_LOCAL_SAVE_FAILED");
  const attempt = createReviewAttempt(storedSet, ownerId);
  return checkpointReviewAttempt(attempt, ownerId);
}

export async function loadLocalReviewAttemptWithSet(attemptId: string, ownerId = getStorageOwner()) {
  const attempt = await getLocalReviewAttempt(attemptId, ownerId);
  if (!attempt?.contentHash) return null;
  const set = await getLocalQuizSet(attempt.contentHash, ownerId);
  return set ? { attempt, set } : null;
}

export async function loadReviewAttemptById(attemptId: string, ownerId = getStorageOwner()) {
  const local = await loadLocalReviewAttemptWithSet(attemptId, ownerId);
  if (ownerId !== getStorageOwner()) return local;
  if (!ownerId || local?.attempt.syncState === "pending" || local?.attempt.syncState === "conflict") return local;
  let captured;
  try { captured = captureStorageOperation(attemptId); } catch { return null; }
  const value = await getAttempt(attemptId, captured.signal).catch(() => null);
  if (!value || !captured.isCurrent()) return local;
  const attempt = serverAttempt(value);
  if (!attempt?.contentHash) return local;
  if (local && local.attempt.serverRevision >= attempt.serverRevision) return local;
  const quizData = value.quizData as ReviewQuizSet["quizData"];
  const set: ReviewQuizSet = {
    quizKey: attempt.quizKey!, contentHash: attempt.contentHash, sourceKind: attempt.sourceKind as ReviewQuizSet["sourceKind"],
    subjectId: attempt.subjectId, categoryId: attempt.categoryId, chapterId: attempt.chapterId, quizId: attempt.quizId,
    title: attempt.title, quizData, serverId: attempt.quizSetId ?? undefined,
  };
  await saveLocalQuizSet(set, ownerId);
  await saveLocalReviewAttempt(attempt, ownerId);
  return { attempt, set };
}

export async function loadLatestCompletedReviewAttempt(scope: { sourceKind: ReviewQuizSet["sourceKind"]; subjectId: string; categoryId: string | null; chapterId: string }, ownerId = getStorageOwner()) {
  if (!ownerId || ownerId !== getStorageOwner()) return null;
  let captured;
  try { captured = captureStorageOperation("review-static-latest"); } catch { return null; }
  let cursor: string | undefined;
  let newest: Record<string, unknown> | null = null;
  for (let page = 0; page < 20 && captured.isCurrent(); page++) {
    const query = new URLSearchParams({ view: "attempts", sourceKind: scope.sourceKind, subjectId: scope.subjectId, chapterId: scope.chapterId, limit: "50" });
    if (scope.categoryId) query.set("categoryId", scope.categoryId);
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/review/progress?${query.toString()}`, { credentials: "same-origin", cache: "no-store", signal: captured.signal }).catch(() => null);
    if (!response?.ok || !captured.isCurrent()) return null;
    const payload: unknown = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;
    const data = payload as { rows?: Array<Record<string, unknown>>; nextCursor?: string | null };
    for (const row of data.rows ?? []) {
      if (row.attemptKind !== "quiz" || row.phase !== "summary" || row.sourceKind !== scope.sourceKind
        || row.subjectId !== scope.subjectId || row.chapterId !== scope.chapterId
        || (typeof row.categoryId === "string" ? row.categoryId : null) !== scope.categoryId) continue;
      if (!newest || asString(row.updatedAt) > asString(newest.updatedAt)) newest = row;
    }
    if (!data.nextCursor || data.nextCursor === cursor) break;
    cursor = data.nextCursor;
  }
  if (!captured.isCurrent() || typeof newest?.attemptId !== "string") return null;
  return loadReviewAttemptById(newest.attemptId, ownerId);
}

export async function loadLatestCompletedStaticAttempt(scope: { subjectId: string; categoryId: string | null; chapterId: string }, ownerId = getStorageOwner()) {
  return loadLatestCompletedReviewAttempt({ ...scope, sourceKind: "static" }, ownerId);
}

export async function loadRemoteResume(
  ownerId = getStorageOwner(),
  scope?: { sourceKind?: ReviewQuizSet["sourceKind"]; subjectId?: string; categoryId?: string | null; chapterId?: string },
) {
  if (!ownerId || ownerId !== getStorageOwner()) return null;
  let captured;
  try { captured = captureStorageOperation("review-resume"); } catch { return null; }
  const query = new URLSearchParams({ view: "resume" });
  if (scope?.sourceKind) query.set("sourceKind", scope.sourceKind);
  if (scope?.subjectId && scope.chapterId) {
    query.set("subjectId", scope.subjectId);
    query.set("chapterId", scope.chapterId);
    if (scope.categoryId) query.set("categoryId", scope.categoryId);
  }
  const response = await fetch(`/api/review/progress?${query.toString()}`, { credentials: "same-origin", cache: "no-store", signal: captured.signal });
  if (!captured.isCurrent()) return null;
  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  const raw: unknown = await response.json();
  const value = raw && typeof raw === "object" && "attempt" in raw ? (raw as { attempt?: unknown }).attempt : raw;
  if (!value || typeof value !== "object") return null;
  const remote = serverAttempt(value as Record<string, unknown>);
  if (!remote || !captured.isCurrent()) return null;
  const local = await loadLocalReviewAttemptWithSet(remote.attemptId, ownerId);
  if (local && (local.attempt.revision > local.attempt.syncedRevision || local.attempt.syncState === "pending")) {
    const conflict = local.attempt.serverRevision !== remote.serverRevision;
    const kept = { ...local.attempt, syncState: conflict ? "conflict" as const : local.attempt.syncState };
    await saveLocalReviewAttempt(kept, ownerId);
    if (conflict) publish(kept);
    return { attempt: kept, set: local.set };
  }
  const set: ReviewQuizSet = {
    quizKey: remote.quizKey!, contentHash: remote.contentHash!, sourceKind: remote.sourceKind as ReviewQuizSet["sourceKind"],
    subjectId: remote.subjectId, categoryId: remote.categoryId, chapterId: remote.chapterId, quizId: remote.quizId,
    title: remote.title, quizData: (value as Record<string, unknown>).quizData as ReviewQuizSet["quizData"], serverId: remote.quizSetId ?? undefined,
  };
  await saveLocalQuizSet(set, ownerId);
  await saveLocalReviewAttempt(remote, ownerId);
  publish(remote);
  return { attempt: remote, set };
}

export async function findResumableReviewAttempt(
  scope: { sourceKind?: ReviewQuizSet["sourceKind"]; subjectId: string; categoryId: string | null; chapterId: string },
  ownerId = getStorageOwner(),
) {
  const localRows = (await listLocalReviewAttempts(ownerId))
    .filter((attempt) => attempt.attemptKind === "quiz" && attempt.phase !== "summary"
      && attempt.subjectId === scope.subjectId && attempt.categoryId === scope.categoryId && attempt.chapterId === scope.chapterId
      && (!scope.sourceKind || attempt.sourceKind === scope.sourceKind))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pending = localRows.find((attempt) => attempt.syncState === "pending" || attempt.syncState === "conflict");
  if (pending) {
    const local = await loadLocalReviewAttemptWithSet(pending.attemptId, ownerId);
    if (local) return local;
  }
  if (ownerId) {
    const remote = await loadRemoteResume(ownerId, scope).catch(() => null);
    if (remote && remote.attempt.subjectId === scope.subjectId && remote.attempt.chapterId === scope.chapterId
      && remote.attempt.categoryId === scope.categoryId && (!scope.sourceKind || remote.attempt.sourceKind === scope.sourceKind)) return remote;
  }
  for (const attempt of localRows) {
    const local = await loadLocalReviewAttemptWithSet(attempt.attemptId, ownerId);
    if (local) return local;
  }
  return null;
}

export async function loadNewestReviewAttempt(ownerId = getStorageOwner()) {
  if (ownerId !== getStorageOwner()) return null;
  const reviewSources: ReviewQuizSet["sourceKind"][] = ["review-wrong", "review-chapter", "classroom"];
  const localRows = (await listLocalReviewAttempts(ownerId))
    .filter((attempt) => attempt.attemptKind === "quiz" && reviewSources.includes(attempt.sourceKind as ReviewQuizSet["sourceKind"]))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const pending = localRows[0];
  if (pending && (pending.syncState === "pending" || pending.syncState === "conflict")) {
    const local = await loadLocalReviewAttemptWithSet(pending.attemptId, ownerId);
    if (local) return local;
  }
  if (!ownerId) {
    for (const row of localRows) {
      const local = await loadLocalReviewAttemptWithSet(row.attemptId, ownerId);
      if (local) return local;
    }
    return null;
  }
  const remote = await Promise.all(reviewSources.map((sourceKind) => loadRemoteResume(ownerId, { sourceKind }).catch(() => null)));
  if (ownerId !== getStorageOwner()) return null;
  const available = remote.filter((value): value is NonNullable<typeof value> => !!value)
    .sort((a, b) => Date.parse(b.attempt.updatedAt) - Date.parse(a.attempt.updatedAt));

  let cursor: string | undefined;
  let newestCompleted: Record<string, unknown> | null = null;
  for (let page = 0; page < 20 && getStorageOwner() === ownerId; page++) {
    let data: Awaited<ReturnType<typeof requestAttemptsPage>>;
    try { data = await requestAttemptsPage(cursor); } catch { break; }
    if (getStorageOwner() !== ownerId) return null;
    for (const row of data.rows ?? []) {
      if (row.attemptKind !== "quiz" || row.phase !== "summary" || !reviewSources.includes(row.sourceKind as ReviewQuizSet["sourceKind"])) continue;
      if (!newestCompleted || Date.parse(asString(row.updatedAt)) > Date.parse(asString(newestCompleted.updatedAt))) newestCompleted = row;
    }
    if (!data.nextCursor || data.nextCursor === cursor) break;
    cursor = data.nextCursor;
  }
  if (typeof newestCompleted?.attemptId === "string") {
    const stored = await loadReviewAttemptById(newestCompleted.attemptId, ownerId).catch(() => null);
    if (stored) available.push(stored);
  }
  if (localRows[0]) {
    const local = await loadLocalReviewAttemptWithSet(localRows[0].attemptId, ownerId);
    if (local) available.push(local);
  }
  return available.sort((a, b) => Date.parse(b.attempt.updatedAt) - Date.parse(a.attempt.updatedAt))[0] ?? null;
}

export async function loadWrongAttemptIdsFromAccount(ownerId = getStorageOwner()): Promise<{ attemptIds: string[]; hasMoreAttemptRecords: boolean; wrongQuestionCount: number }> {
  if (!ownerId || ownerId !== getStorageOwner()) return { attemptIds: [], hasMoreAttemptRecords: true, wrongQuestionCount: 0 };
  let captured;
  try { captured = captureStorageOperation("review-wrong-attempt-index"); } catch { return { attemptIds: [], hasMoreAttemptRecords: true, wrongQuestionCount: 0 }; }
  const attemptIds: string[] = [];
  const latestOutcomes = new Map<string, { correct: boolean; time: number }>();
  const result = (hasMoreAttemptRecords: boolean) => ({ attemptIds: [...new Set(attemptIds)], hasMoreAttemptRecords, wrongQuestionCount: [...latestOutcomes.values()].filter((outcome) => !outcome.correct).length });
  let cursor: string | undefined;
  for (let page = 0; page < 20 && captured.isCurrent(); page++) {
    let data: Awaited<ReturnType<typeof requestAttemptsPage>>;
    try { data = await requestAttemptsPage(cursor, captured.signal); } catch { return result(true); }
    if (!captured.isCurrent()) return { attemptIds: [], hasMoreAttemptRecords: false, wrongQuestionCount: 0 };
    for (const row of data.rows ?? []) {
      if (row.attemptKind !== "quiz" || typeof row.attemptId !== "string") continue;
      const results = Array.isArray(row.questionResults) ? row.questionResults as Array<Record<string, unknown>> : [];
      // Include later correct attempts too: the server needs the newest outcome to
      // distinguish a historical miss from a question the learner has since mastered.
      if (results.some((result) => result.objective === true && typeof result.correct === "boolean")) attemptIds.push(row.attemptId);
      for (const outcome of results) {
        if (outcome.objective !== true || typeof outcome.correct !== "boolean" || typeof outcome.id !== "string") continue;
        const key = typeof outcome.questionKey === "string" ? outcome.questionKey : `${asString(row.quizSetId)}:${outcome.id}`;
        const time = Date.parse(asString(row.completedAt) || asString(row.updatedAt)) || 0;
        const existing = latestOutcomes.get(key);
        if (!existing || time > existing.time) latestOutcomes.set(key, { correct: outcome.correct, time });
      }
    }
    if (!data.nextCursor || data.nextCursor === cursor) return result(false);
    cursor = data.nextCursor;
  }
  return result(!!cursor);
}

export async function hydrateReviewProgress(ownerId = getStorageOwner()): Promise<void> {
  if (!ownerId || ownerId !== getStorageOwner()) return;
  const startedEpoch = getOwnerEpoch();
  let captured;
  try { captured = captureStorageOperation("review-progress-hydrate"); } catch { return; }
  const current = () => captured.isCurrent() && getStorageOwner() === ownerId && getOwnerEpoch() === startedEpoch;
  for (const local of await listLocalReviewAttempts(ownerId)) {
    if (!current()) return;
    if (local.syncState === "pending" || local.syncState === "conflict") await queueSync(ownerId, local.attemptId);
  }
  let cursor: string | undefined;
  for (let page = 0; page < 100 && current(); page++) {
    let data: Awaited<ReturnType<typeof requestAttemptsPage>>;
    try { data = await requestAttemptsPage(cursor, captured.signal); } catch { return; }
    if (!current()) return;
    for (const row of data.rows ?? []) mergeServerScore(row, ownerId);
    if (!data.nextCursor || data.nextCursor === cursor) break;
    cursor = data.nextCursor;
  }
  const resume = await loadRemoteResume(ownerId).catch(() => null);
  if (resume?.attempt.syncState === "pending") void queueSync(ownerId, resume.attempt.attemptId);
}

onOwnerChangeHydrate();
function onOwnerChangeHydrate() {
  onStorageOwnerChange((_previous, next) => {
    if (next) void hydrateReviewProgress(next);
  });
}
registerOwnerHydrator(() => hydrateReviewProgress());
