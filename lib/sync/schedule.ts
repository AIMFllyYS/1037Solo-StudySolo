import type { CloudSyncKind } from "./types";
import {setSyncItemStatus} from './status';
import {registerSyncIntent} from './journal';

let enabled = false;
let suppress = 0;

export function isCloudSyncEnabled(): boolean {
  return enabled;
}

export function setCloudSyncEnabled(value: boolean): void {
  enabled = value;
}

export function beginCloudSyncApply(): void {
  suppress += 1;
}

export function endCloudSyncApply(): void {
  suppress = Math.max(0, suppress - 1);
}

function canSchedule(): boolean {
  return enabled && suppress === 0 && typeof window !== "undefined";
}

export function scheduleCloudUpsert(kind: CloudSyncKind, clientId: string): void {
  if (!canSchedule() || !clientId) return;
  setSyncItemStatus(`${kind}:${clientId}`,{phase:'pending'});
  const intent = registerSyncIntent(kind,clientId,'upsert');
  void import("./engine").then((mod) => mod.activateSyncIntent(intent));
}

export function scheduleCloudTombstone(kind: CloudSyncKind, clientId: string): void {
  if (!canSchedule() || !clientId) return;
  setSyncItemStatus(`${kind}:${clientId}`,{phase:'pending',operation:'delete'});
  const intent = registerSyncIntent(kind,clientId,'tombstone');
  void import("./engine").then((mod) => mod.activateSyncIntent(intent));
}

export function scheduleCloudPull(): void {
  if (!canSchedule()) return;
  const start = () => {
    void import("./engine").then((mod) => mod.pullAndPushAll());
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => start(), { timeout: 4000 });
    return;
  }
  setTimeout(start, 0);
}
/** Explicit refresh waits for the actual sync operation; background scheduling remains unchanged. */
export async function refreshCloudSyncNow(): Promise<void> {
  if (!canSchedule()) return;
  await (await import('./engine')).pullAndPushAll();
}
