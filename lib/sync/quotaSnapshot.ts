import { CLOUD_SYNC_KINDS, type CloudSyncKind, type SyncDocumentRow, type SyncDocumentsApi, type SyncQuotaPool } from "./types";
import type { SyncJob } from "./journal";
import { payloadByteSize, quotaPoolForKind } from "./payload";
import { summarizeSyncUsage, type CloudSyncUsage } from "./usage";
import { setCloudRowKeys } from "./status";
import { ownerStillCurrent } from "./ownership";
type Job = SyncJob;
/** Internal snapshot owned by the engine's owner-change/reset lifecycle. */
export const syncUsageState = { remoteBytesByKey: new Map<string, number>(), remoteBytesReady: false };
function jobKey(kind: CloudSyncKind, clientId: string): string { return `${kind}:${clientId}`; }
function parseJobKey(key: string): CloudSyncKind | null {
  for (const kind of CLOUD_SYNC_KINDS) {
    if (key.startsWith(`${kind}:`)) return kind;
  }
  return null;
}

export function getCachedCloudSyncUsage(): CloudSyncUsage | null {
  if (!syncUsageState.remoteBytesReady) return null;
  return summarizeSyncUsage(
    [...syncUsageState.remoteBytesByKey].flatMap(([key, bytes]) => {
      const kind = parseJobKey(key);
      return kind && bytes > 0 ? [{ kind, bytes }] : [];
    }),
    "cloud",
  );
}

export function rememberRemoteBytesFromRows(rows: SyncDocumentRow[]): void {
  const next = new Map<string, number>();
  for (const row of rows) {
    if (row.deleted) continue;
    next.set(jobKey(row.kind, row.client_id), payloadByteSize(row.payload));
  }
  syncUsageState.remoteBytesByKey = next;
  syncUsageState.remoteBytesReady = true;
  setCloudRowKeys(next.keys());
}

export function noteRemoteBytes(kind: CloudSyncKind, clientId: string, bytes: number, deleted: boolean): void {
  const key = jobKey(kind, clientId);
  if (deleted) syncUsageState.remoteBytesByKey.delete(key);
  else syncUsageState.remoteBytesByKey.set(key, bytes);
  setCloudRowKeys(syncUsageState.remoteBytesByKey.keys());
}

function cachedUserBytes(skipKind: CloudSyncKind, skipId: string): number | null {
  if (!syncUsageState.remoteBytesReady) return null;
  let bytes = 0;
  const skip = jobKey(skipKind, skipId);
  for (const [key, value] of syncUsageState.remoteBytesByKey) {
    if (key === skip) continue;
    bytes += value;
  }
  return bytes;
}

export function cachedPoolBytes(pool: SyncQuotaPool, skipKind: CloudSyncKind, skipId: string): number {
  let bytes = 0;
  const skip = jobKey(skipKind, skipId);
  for (const [key, value] of syncUsageState.remoteBytesByKey) {
    if (key === skip) continue;
    const kind = parseJobKey(key);
    if (!kind || quotaPoolForKind(kind) !== pool) continue;
    bytes += value;
  }
  return bytes;
}

export async function remoteUserBytes(
  api: SyncDocumentsApi,
  skipKind: CloudSyncKind,
  skipId: string,
  job?: Job,
): Promise<{ bytes: number; error: string | null }> {
  const cached = cachedUserBytes(skipKind, skipId);
  if (cached != null) return { bytes: cached, error: null };
  const { data, error } = await api.list(CLOUD_SYNC_KINDS);
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return { bytes: 0, error: "sync_owner_changed" };
  if (error) return { bytes: 0, error: error.message };
  rememberRemoteBytesFromRows(data);
  return { bytes: cachedUserBytes(skipKind, skipId) ?? 0, error: null };
}
