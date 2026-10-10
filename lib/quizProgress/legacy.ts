import { getStorageOwner, ownedStorageKeyFor } from "@/lib/storage/ownerScope";
import type { ProgressEntry } from "./contracts";
import { toProgressEntries } from "./entries";
import { readAt } from "./io";
import { LS_KEY, LEGACY_IMPORT_STATE_KEY, createLocalId, OWNER_LEGACY_IMPORTED_KEY, scopedKeyOf } from "./keys";
import { notifyQuizProgressChanged } from "./events";
/** The v1 key has no owner; it remains a separate local-only history until the user imports it. */
export function getLegacyLocalProgress(): ProgressEntry[] {
  if (typeof window === "undefined") return [];
  return toProgressEntries(readAt(LS_KEY));
}

export function hasLegacyLocalProgress(): boolean {
  return getLegacyLocalProgress().length > 0;
}

export function getLegacyImportState(ownerId = getStorageOwner()): { importId: string; status: "pending" | "complete"; localImported?: boolean } | null {
  if (!ownerId || typeof window === "undefined") return null;
  try {
    const key = ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY);
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.importId !== "string" || (record.status !== "pending" && record.status !== "complete")) return null;
    return { importId: record.importId, status: record.status, localImported: record.localImported === true };
  } catch {
    return null;
  }
}

/** Create/reuse a per-owner idempotency marker only after an explicit user action. */
export function beginLegacyImport(ownerId = getStorageOwner()): { importId: string; entries: ProgressEntry[] } | null {
  if (!ownerId || ownerId !== getStorageOwner() || !hasLegacyLocalProgress() || getLegacyImportState(ownerId)?.status === "complete") return null;
  const current = getLegacyImportState(ownerId);
  const importId = current?.importId ?? createLocalId();
  try {
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ importId, status: "pending" }));
  } catch {
    return null;
  }
  return { importId, entries: getLegacyLocalProgress() };
}

export function completeLegacyImport(ownerId: string, importId: string): boolean {
  if (ownerId !== getStorageOwner()) return false;
  const current = getLegacyImportState(ownerId);
  if (!current || current.importId !== importId) return false;
  try {
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ importId, status: "complete" }));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

/** Explicit one-time merge, called only after the import API has persisted the same legacy rows. */
export function importLegacyProgressLocally(ownerId: string): boolean {
  if (!ownerId || ownerId !== getStorageOwner()) return false;
  const marker = getLegacyImportState(ownerId);
  if (!marker || marker.status === "complete") return false;
  if (marker.localImported) return true;
  const legacy = readAt(LS_KEY);
  if (!Object.keys(legacy).length) return false;
  try {
    // Keep historical aggregates visibly separate from objective mastery and snapshots.
    localStorage.setItem(ownedStorageKeyFor(ownerId, OWNER_LEGACY_IMPORTED_KEY), JSON.stringify(legacy));
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ ...marker, localImported: true }));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

/** Explicitly imported v1 aggregates are available for history UI, never as question context. */
export function getOwnerLegacyImportedProgress(ownerId = getStorageOwner()): ProgressEntry[] {
  if (!ownerId || ownerId !== getStorageOwner()) return [];
  return toProgressEntries(readAt(ownedStorageKeyFor(ownerId, OWNER_LEGACY_IMPORTED_KEY)));
}

/** Hydrate a server summary on another device without treating it as current mastery or question context. */
export function saveOwnerLegacyImportedSummary(input: {
  ownerId: string;
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  best: number;
  attempts: number;
  lastPercent: number | null;
  completedAt: string;
  stage: "submitted" | "final";
}): boolean {
  if (!input.ownerId || input.ownerId !== getStorageOwner() || !input.subjectId || !input.chapterId) return false;
  const key = ownedStorageKeyFor(input.ownerId, OWNER_LEGACY_IMPORTED_KEY);
  const map = readAt(key);
  const scope = scopedKeyOf(input.subjectId, input.chapterId, input.categoryId);
  // A locally imported full v1 summary is richer than the intentionally compact server page.
  if (map[scope]) return true;
  map[scope] = {
    best: input.best,
    attempts: input.attempts,
    objectiveBest: 0,
    objectiveAttempts: 0,
    completedAttemptIds: [],
    objectiveAttemptIds: [],
    last: {
      earned: 0,
      max: 0,
      percent: input.lastPercent,
      completedAt: input.completedAt,
      stage: input.stage,
    },
  };
  try {
    localStorage.setItem(key, JSON.stringify(map));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}