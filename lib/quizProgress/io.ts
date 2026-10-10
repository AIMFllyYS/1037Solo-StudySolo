import type { ProgressMap } from "./contracts";
import { activeProgressKey } from "./keys";
import { notifyQuizProgressChanged } from "./events";
export function readAt(key: string | null): ProgressMap {
  if (typeof window === "undefined" || !key) return {};
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ProgressMap : {};
  } catch {
    return {};
  }
}

export function loadAll(): ProgressMap {
  if (typeof window === "undefined") return {};
  return readAt(activeProgressKey());
}

export function persistAll(map: ProgressMap): boolean {
  if (typeof window === "undefined") return false;
  const key = activeProgressKey();
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(map));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}