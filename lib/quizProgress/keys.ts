import { getStorageOwner, ownedStorageKeyFor } from "@/lib/storage/ownerScope";

export const LS_KEY = "gailvlun-quiz-progress-v1";
export const OWNER_PROGRESS_KEY = "review-quiz-progress-v2";
export const LEGACY_IMPORT_STATE_KEY = "review-quiz-legacy-import-v1";
export const OWNER_LEGACY_IMPORTED_KEY = "review-quiz-legacy-imported-v1";
export const CHANGE_EVENT = "studysolo:quiz-progress-change";

export function keyOf(subjectId: string, chapterId: string): string {
  return `${subjectId}/${chapterId}`;
}

export function scopedKeyOf(subjectId: string, chapterId: string, categoryId?: string | null): string {
  return categoryId ? `${subjectId}/${categoryId}/${chapterId}` : keyOf(subjectId, chapterId);
}

export function activeProgressKey(): string | null {
  const owner = getStorageOwner();
  return owner ? ownedStorageKeyFor(owner, OWNER_PROGRESS_KEY) : LS_KEY;
}

export function createLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* test/older browser fallback below */
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}