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
import type { LegacyImportRequest, ReviewQuizAttempt, ReviewQuizSet } from "./attemptTypes";
import { canonicalJson } from "./quizSnapshot";
import type { QuizAttempt } from "@/lib/quiz-progress";
import {
  beginLegacyImport,
  completeLegacyImport,
  getLegacyImportState,
  importLegacyProgressLocally,
  saveAttempt,
  saveOwnerLegacyImportedSummary,
  type ProgressEntry,
} from "@/lib/quiz-progress";

type SyncSnapshot = Pick<ReviewQuizAttempt, "attemptId" | "syncState" | "revision" | "serverRevision" | "syncedRevision">;
type SyncListener = (snapshot: SyncSnapshot) => void;
const listeners = new Set<SyncListener>();
const queues = new Map<string, Promise<unknown>>();
const localWriteQueues = new Map<string, Promise<unknown>>();
const scheduledSyncs = new Map<string, { timer: ReturnType<typeof setTimeout>; waiters: Array<() => void> }>();

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function publish(attempt: ReviewQuizAttempt) {
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

function isBlankAnswering(attempt: ReviewQuizAttempt): boolean {
  return attempt.phase === "answering" && attempt.stage === null
    && attempt.currentIndex === 0
    && Object.keys(attempt.answers).length === 0 && attempt.revealedQuestionIds.length === 0
    && attempt.hintsUsed.length === 0 && Object.keys(attempt.selfScores).length === 0;
}

function requestAttempt(attempt: ReviewQuizAttempt, expectedRevision: number) {
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

async function post(body: unknown, signal?: AbortSignal, expectedOwnerId?: string): Promise<Record<string, unknown>> {
  const ownerId = expectedOwnerId ?? getStorageOwner();
  if (!ownerId) throw new Error("REVIEW_OWNER_UNAVAILABLE");
  if (getStorageOwner() !== ownerId) throw new Error("REVIEW_OWNER_CHANGED");
  const ownerBinding = await ownerBindingFor(ownerId);
  if (getStorageOwner() !== ownerId) throw new Error("REVIEW_OWNER_CHANGED");
  const response = await fetch("/api/review/progress", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-studysolo-owner-binding": ownerBinding },
    body: JSON.stringify(body),
    signal,
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object") {
    const code = value && typeof value === "object" && typeof (value as Record<string, unknown>).code === "string"
      ? String((value as Record<string, unknown>).code)
      : "REVIEW_PROGRESS_UNAVAILABLE";
    throw new Error(response.status === 409 ? `CONFLICT:${code}` : code);
  }
  return value as Record<string, unknown>;
}

async function ownerBindingFor(ownerId: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("REVIEW_HASH_UNAVAILABLE");
  const data = new TextEncoder().encode(`studysolo-review-owner-binding-v1:${ownerId}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getAttempt(attemptId: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const response = await fetch(`/api/review/progress?attemptId=${encodeURIComponent(attemptId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object") throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function serverAttempt(value: Record<string, unknown>): ReviewQuizAttempt | null {
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

function queueLocalWrite<T>(ownerId: string | null, attemptId: string, write: () => Promise<T>): Promise<T> {
  const key = `${ownerId ?? "guest"}:${attemptId}`;
  const previous = localWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  localWriteQueues.set(key, next);
  return next.finally(() => { if (localWriteQueues.get(key) === next) localWriteQueues.delete(key); });
}

function retainAcknowledgedMetadata(attempt: ReviewQuizAttempt, existing: ReviewQuizAttempt | null): ReviewQuizAttempt {
  if (!existing) return attempt;
  return {
    ...attempt,
    quizSetId: existing.quizSetId ?? attempt.quizSetId,
    serverRevision: Math.max(existing.serverRevision, attempt.serverRevision),
    syncedRevision: Math.max(existing.syncedRevision, attempt.syncedRevision),
  };
}

async function saveMetadata(attempt: ReviewQuizAttempt, ownerId: string, isCurrent: () => boolean): Promise<boolean> {
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

async function requestAttemptsPage(cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ view: "attempts", limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/review/progress?${query.toString()}`, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  return value as { rows?: Array<Record<string, unknown>>; nextCursor?: string | null };
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

function mergeServerScore(row: Record<string, unknown>, ownerId: string) {
  if (row.attemptKind === "legacy-summary") {
    const legacy = row.legacyData && typeof row.legacyData === "object" ? row.legacyData as Record<string, unknown> : null;
    const last = legacy?.last && typeof legacy.last === "object" ? legacy.last as Record<string, unknown> : null;
    if (typeof row.subjectId === "string" && typeof row.chapterId === "string" && legacy && last) {
      saveOwnerLegacyImportedSummary({
        ownerId,
        subjectId: row.subjectId,
        categoryId: typeof row.categoryId === "string" ? row.categoryId : null,
        chapterId: row.chapterId,
        best: Number(legacy.best ?? 0),
        attempts: Number(legacy.attempts ?? 0),
        lastPercent: typeof last.percent === "number" ? last.percent : null,
        completedAt: asString(last.completedAt) || asString(row.updatedAt, new Date(0).toISOString()),
        stage: last.stage === "submitted" ? "submitted" : "final",
      });
    }
    return;
  }
  if (row.phase !== "summary" && row.stage !== "submitted") return;
  const score = row.score && typeof row.score === "object" ? row.score as Record<string, unknown> : {};
  const objectiveCount = Number(score.objectiveCount ?? 0);
  const correctCount = Number(score.correctCount ?? 0);
  const attempt: QuizAttempt = {
    title: asString(row.title),
    attemptId: asString(row.attemptId),
    quizId: asString(row.quizId),
    sourceKind: row.sourceKind as QuizAttempt["sourceKind"],
    categoryId: typeof row.categoryId === "string" ? row.categoryId : undefined,
    earned: Number(score.earned ?? 0),
    max: Number(score.max ?? 0),
    percent: typeof score.percent === "number" ? score.percent : null,
    completedAt: asString(row.completedAt) || asString(row.updatedAt, new Date().toISOString()),
    stage: row.stage === "submitted" ? "submitted" : "final",
    objectiveCount,
    correctCount,
    scoredCount: Number(score.scoredCount ?? 0),
    objectiveAccuracy: objectiveCount > 0 ? Math.round((correctCount / objectiveCount) * 1000) / 10 : null,
  };
  const subjectId = asString(row.subjectId);
  const chapterId = asString(row.chapterId);
  if (subjectId && chapterId) saveAttempt(subjectId, chapterId, attempt);
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

export async function importLegacyEntries(ownerId: string, importId: string, entries: LegacyImportRequest[]): Promise<void> {
  if (!ownerId || ownerId !== getStorageOwner()) throw new Error("REVIEW_OWNER_CHANGED");
  const captured = captureStorageOperation("review-legacy-import");
  for (const entry of entries) {
    if (!captured.isCurrent()) throw new Error("REVIEW_OWNER_CHANGED");
    const response = await post({ action: "import-legacy", importId, entry }, captured.signal, ownerId);
    if (response.status !== "saved") throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  }
}

/** Import the unowned v1 key only after a direct user action; never run during hydration. */
export async function importLegacyLocalHistory(ownerId: string): Promise<number> {
  const batch = beginLegacyImport(ownerId);
  if (!batch) {
    if (getLegacyImportState(ownerId)?.status === "complete") return 0;
    throw new Error("REVIEW_LEGACY_HISTORY_UNAVAILABLE");
  }
  const requests = batch.entries.map((entry: ProgressEntry): LegacyImportRequest => ({
    subjectId: entry.subjectId,
    categoryId: entry.categoryId ?? null,
    chapterId: entry.chapterId,
    title: `${entry.subjectId} · ${entry.chapterId}`,
    progress: {
      best: Math.max(0, Math.min(100, entry.progress.best ?? 0)),
      attempts: Math.max(0, Math.trunc(entry.progress.attempts ?? 0)),
      last: {
        earned: Math.max(0, entry.progress.last?.earned ?? 0),
        max: Math.max(0, entry.progress.last?.max ?? 0),
        percent: typeof entry.progress.last?.percent === "number" ? Math.max(0, Math.min(100, entry.progress.last.percent)) : null,
        completedAt: entry.progress.last?.completedAt || new Date(0).toISOString(),
        stage: entry.progress.last?.stage === "submitted" ? "submitted" : "final",
        ...(entry.progress.last?.perQuestion ? {
          perQuestion: entry.progress.last.perQuestion.slice(0, 500).map((item) => ({
            id: item.id.slice(0, 300),
            awarded: Math.max(0, item.awarded),
            max: Math.max(0, item.max),
            correct: item.correct,
          })),
        } : {}),
      },
    },
  }));
  if (!requests.length) throw new Error("REVIEW_LEGACY_HISTORY_UNAVAILABLE");
  await importLegacyEntries(ownerId, batch.importId, requests);
  if (ownerId !== getStorageOwner() || !importLegacyProgressLocally(ownerId)
    || !completeLegacyImport(ownerId, batch.importId)) {
    throw new Error("REVIEW_OWNER_CHANGED");
  }
  return batch.entries.length;
}

onOwnerChangeHydrate();
function onOwnerChangeHydrate() {
  onStorageOwnerChange((_previous, next) => {
    if (next) void hydrateReviewProgress(next);
  });
}
registerOwnerHydrator(() => hydrateReviewProgress());
