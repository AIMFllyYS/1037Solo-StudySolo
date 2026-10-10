import { onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { activeProgressKey, CHANGE_EVENT } from "./keys";
const progressListeners = new Set<() => void>();
let storageListenerBound = false;
let progressVersion = 0;
export function getQuizProgressVersion(): number {
  return progressVersion;
}
export function subscribeQuizProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  if (!storageListenerBound && typeof window !== "undefined") {
    storageListenerBound = true;
    window.addEventListener("storage", (event) => {
      const key = activeProgressKey();
      if (key && event.key === key) notifyQuizProgressChanged(false);
    });
  }
  return () => progressListeners.delete(listener);
}

onStorageOwnerChange(() => notifyQuizProgressChanged());

export function notifyQuizProgressChanged(dispatch = true): void {
  progressVersion++;
  for (const listener of [...progressListeners]) listener();
  if (dispatch && typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}
