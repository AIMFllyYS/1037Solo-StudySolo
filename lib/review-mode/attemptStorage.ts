import { PERSIST_KEYS, readOwnedStorageItem, writeOwnedStorageItem, listPersistedKeysForOwner } from "@/lib/storage/idbStorage";
import { getStorageOwner, ownedStorageKeyFor } from "@/lib/storage/ownerScope";
import type { ReviewQuizAttempt, ReviewQuizSet } from "./attemptTypes";

const ATTEMPT_PREFIX = `${PERSIST_KEYS.reviewQuizAttempts}:`;
const SET_PREFIX = `${PERSIST_KEYS.reviewQuizSets}:`;
const GUEST_ATTEMPT_PREFIX = "gailvlun-guest-review-quiz-attempts:";
const GUEST_SET_PREFIX = "gailvlun-guest-review-quiz-sets:";

function localKey(ownerId: string | null, name: string): string {
  return ownerId ? ownedStorageKeyFor(ownerId, name) : `gailvlun-guest:${name}`;
}

async function read(ownerId: string | null, name: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (ownerId) {
    const value = await readOwnedStorageItem(ownerId, name);
    if (value !== null) return value;
  }
  try {
    return localStorage.getItem(localKey(ownerId, name));
  } catch {
    return null;
  }
}

async function write(ownerId: string | null, name: string, value: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (ownerId) {
    if (ownerId !== getStorageOwner()) return false;
    if (await writeOwnedStorageItem(ownerId, name, value)) return true;
  }
  try {
    if (ownerId && ownerId !== getStorageOwner()) return false;
    localStorage.setItem(localKey(ownerId, name), value);
    return true;
  } catch {
    return false;
  }
}

export async function saveLocalQuizSet(set: ReviewQuizSet, ownerId = getStorageOwner()): Promise<ReviewQuizSet | null> {
  const key = `${ownerId ? SET_PREFIX : GUEST_SET_PREFIX}${set.contentHash}`;
  const existingText = await read(ownerId, key);
  if (existingText) {
    try {
      const existing = JSON.parse(existingText) as ReviewQuizSet;
      if (existing.contentHash === set.contentHash && existing.quizKey === set.quizKey) return existing;
      return null;
    } catch {
      return null;
    }
  }
  return await write(ownerId, key, JSON.stringify(set)) ? set : null;
}

export async function getLocalQuizSet(contentHash: string, ownerId = getStorageOwner()): Promise<ReviewQuizSet | null> {
  const key = `${ownerId ? SET_PREFIX : GUEST_SET_PREFIX}${contentHash}`;
  const raw = await read(ownerId, key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ReviewQuizSet;
    return value.contentHash === contentHash ? value : null;
  } catch {
    return null;
  }
}

export async function saveLocalReviewAttempt(attempt: ReviewQuizAttempt, ownerId = getStorageOwner()): Promise<boolean> {
  const prefix = ownerId ? ATTEMPT_PREFIX : GUEST_ATTEMPT_PREFIX;
  return write(ownerId, `${prefix}${attempt.attemptId}`, JSON.stringify(attempt));
}

export async function getLocalReviewAttempt(attemptId: string, ownerId = getStorageOwner()): Promise<ReviewQuizAttempt | null> {
  if (!/^[a-f0-9-]{36}$/i.test(attemptId)) return null;
  const prefix = ownerId ? ATTEMPT_PREFIX : GUEST_ATTEMPT_PREFIX;
  const raw = await read(ownerId, `${prefix}${attemptId}`);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ReviewQuizAttempt;
    return value.attemptId === attemptId ? value : null;
  } catch {
    return null;
  }
}

export async function listLocalReviewAttempts(ownerId = getStorageOwner()): Promise<ReviewQuizAttempt[]> {
  if (ownerId !== getStorageOwner()) return [];
  if (!ownerId) {
    if (typeof window === "undefined") return [];
    const rows: ReviewQuizAttempt[] = [];
    const prefix = localKey(null, GUEST_ATTEMPT_PREFIX);
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const value = await getLocalReviewAttempt(key.slice(prefix.length), null);
        if (value) rows.push(value);
      }
    } catch { return rows; }
    return rows;
  }
  const attemptPrefix = `${PERSIST_KEYS.reviewQuizAttempts}:`;
  const keys = await listPersistedKeysForOwner(ownerId);
  const ids = keys.filter((name) => name.startsWith(attemptPrefix)).map((name) => name.slice(attemptPrefix.length));
  const rows: ReviewQuizAttempt[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = await Promise.all(ids.slice(offset, offset + 100).map((attemptId) => getLocalReviewAttempt(attemptId, ownerId)));
    for (const attempt of batch) if (attempt) rows.push(attempt);
  }
  return rows;
}

export function reviewAttemptKeyPrefix(): string {
  return ATTEMPT_PREFIX;
}
