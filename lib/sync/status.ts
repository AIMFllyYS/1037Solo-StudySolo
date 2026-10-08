"use client";

import { useSyncExternalStore } from "react";

export type CloudSyncPhase = "idle" | "syncing" | "error" | "merged";

export interface CloudSyncStatus {
  phase: CloudSyncPhase;
  message: string | null;
}

const IDLE: CloudSyncStatus = { phase: "idle", message: null };

let current: CloudSyncStatus = IDLE;
export type SyncItemPhase = 'pending' | 'syncing' | 'synced' | 'blocked' | 'error' | 'conflict';
export interface SyncItemStatus { phase: SyncItemPhase; message?: string; retryable?: boolean; retryAfterMs?: number; operation?: 'delete' | 'save' }
let items: Readonly<Record<string, SyncItemStatus>> = {};
export function setSyncItemStatus(key: string, status: SyncItemStatus): void { items = { ...items, [key]: status }; emit(); }
export function getSyncItemStatus(key: string): SyncItemStatus | undefined { return items[key]; }
export function resetSyncItemStatuses():void{items={};emit();}
export function useSyncItems(): Readonly<Record<string, SyncItemStatus>> { return useSyncExternalStore(subscribeCloudSync, () => items, () => items); }
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return current;
}

export function subscribeCloudSync(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function setCloudSyncStatus(next: CloudSyncStatus): void {
  current = next;
  emit();
}

export function clearCloudSyncMessage(): void {
  if (!current.message && current.phase === "idle") return;
  current = {
    phase: current.phase === "syncing" ? "syncing" : "idle",
    message: null,
  };
  emit();
}

export function useCloudSyncStatus(): CloudSyncStatus {
  return useSyncExternalStore(subscribeCloudSync, getCloudSyncStatus, getCloudSyncStatus);
}

export function __resetCloudSyncStatusForTests(): void {
  current = IDLE;
  items = {};
  cloudRowKeys = null;
}

/* ── 云端行索引 ────────────────────────────────────────────────────────────
 * 只读快照：最近一次拉取时云端有哪些 `kind:clientId`。
 * 放在这个轻模块（而不是 engine）是为了让「我的资产」这类 UI 不必把整个同步引擎拖进 chunk。
 * 语义：null = 还没和云端对过账（不显示角标，不猜）；Set = 以这次拉取为准。 */
let cloudRowKeys: ReadonlySet<string> | null = null;

export function setCloudRowKeys(keys: Iterable<string> | null): void {
  cloudRowKeys = keys ? new Set(keys) : null;
  // Existing status subscribers must recompute origin badges when the index changes.
  emit();
}
export function useCloudRowKeys(): ReadonlySet<string> | null {
  return useSyncExternalStore(subscribeCloudSync, () => cloudRowKeys, () => null);
}

export function hasCloudRow(kind: string, clientId: string): boolean | null {
  if (!cloudRowKeys) return null;
  return cloudRowKeys.has(`${kind}:${clientId}`);
}
