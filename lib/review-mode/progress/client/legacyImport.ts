import { captureStorageOperation, getStorageOwner } from "@/lib/storage/ownerScope";

import type { LegacyImportRequest } from "../../attemptTypes";

import { beginLegacyImport, completeLegacyImport, getLegacyImportState, importLegacyProgressLocally, type ProgressEntry } from "@/lib/quiz-progress";
import { post } from "./client";
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
