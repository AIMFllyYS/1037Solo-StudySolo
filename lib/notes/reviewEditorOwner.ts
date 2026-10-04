import { captureStorageOperation, getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { useUserNotes } from "@/lib/stores/userNotes";

export interface ReviewEditorOwnerBinding {
  ownerId: string | null;
  ownerEpoch: number;
  key: string;
  isCurrent: () => boolean;
}

/** Capture the canonical runtime owner for one editor instance; this is a guard, never authority. */
export function captureReviewEditorOwner(
  noteId: string | null,
  hydratedOwnerEpoch = useUserNotes.getState()._hydratedOwnerEpoch,
): ReviewEditorOwnerBinding {
  const ownerId = getStorageOwner();
  const ownerEpoch = getOwnerEpoch();
  const operation = ownerId && noteId ? captureStorageOperation(noteId) : null;
  return Object.freeze({
    ownerId,
    ownerEpoch,
    key: (ownerId ?? "guest") + ":" + ownerEpoch,
    isCurrent: () => {
      if (getStorageOwner() !== ownerId || getOwnerEpoch() !== ownerEpoch) return false;
      if (
        ownerId &&
        (hydratedOwnerEpoch !== ownerEpoch || useUserNotes.getState()._hydratedOwnerEpoch !== ownerEpoch)
      ) return false;
      return operation?.isCurrent() ?? true;
    },
  });
}

/** Signed-in editors remain read-only until this owner's local partition has hydrated. */
export function isReviewNoteOwnerReady(
  hydratedOwnerEpoch = useUserNotes.getState()._hydratedOwnerEpoch,
): boolean {
  const ownerId = getStorageOwner();
  return !ownerId || hydratedOwnerEpoch === getOwnerEpoch();
}
