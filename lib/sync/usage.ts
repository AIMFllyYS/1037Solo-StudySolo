import {
  CLOUD_SYNC_KINDS,
  KIND_QUOTA_POOL,
  KIND_SIZE_LIMIT,
  MAX_USER_SYNC_BYTES,
  POOL_SIZE_LIMIT,
  type CloudSyncKind,
  type SyncDocumentRow,
  type SyncQuotaPool,
} from "./types";
import { payloadByteSize } from "./payload";
import type { I18nKey } from "@/lib/i18n";

export type CloudSyncUsageSource = "cloud" | "local";

export interface CloudSyncKindUsage {
  kind: CloudSyncKind;
  /** 名称 / 单位的文案 key（值见 panel.storage.kind.*）；渲染处 t() 取词。 */
  labelKey: I18nKey;
  unitKey: I18nKey;
  bytes: number;
  count: number;
  limitBytes: number;
}

export interface CloudSyncPoolUsage {
  id: SyncQuotaPool;
  labelKey: I18nKey;
  unitKey: I18nKey;
  bytes: number;
  count: number;
  limitBytes: number;
}

export interface CloudSyncUsage {
  source: CloudSyncUsageSource;
  totalBytes: number;
  limitBytes: number;
  kinds: CloudSyncKindUsage[];
  pools: CloudSyncPoolUsage[];
  error?: string;
}

export const SYNC_KIND_META: Record<CloudSyncKind, { labelKey: I18nKey; unitKey: I18nKey }> = {
  'image-gen':{labelKey:'panel.storage.kind.imageGen.label',unitKey:'panel.storage.kind.imageGen.unit'},
  "chat-session": { labelKey: "panel.storage.kind.chatSession.label", unitKey: "panel.storage.kind.chatSession.unit" },
  artifact: { labelKey: "panel.storage.kind.artifact.label", unitKey: "panel.storage.kind.artifact.unit" },
  document: { labelKey: "panel.storage.kind.document.label", unitKey: "panel.storage.kind.document.unit" },
  "user-note": { labelKey: "panel.storage.kind.userNote.label", unitKey: "panel.storage.kind.userNote.unit" },
  "review-card": { labelKey: "panel.storage.kind.reviewCard.label", unitKey: "panel.storage.kind.reviewCard.unit" },
  "chat-project": { labelKey: "panel.storage.kind.chatProject.label", unitKey: "panel.storage.kind.chatProject.unit" },
};

export const SYNC_POOL_META: Record<SyncQuotaPool, { labelKey: I18nKey; unitKey: I18nKey }> = {
  notes: { labelKey: "panel.storage.pool.notes.label", unitKey: "panel.storage.pool.notes.unit" },
  flashcards: { labelKey: "panel.storage.pool.flashcards.label", unitKey: "panel.storage.pool.flashcards.unit" },
};

function emptyPools(): CloudSyncPoolUsage[] {
  return (Object.keys(POOL_SIZE_LIMIT) as SyncQuotaPool[]).map((id) => ({
    id,
    ...SYNC_POOL_META[id],
    bytes: 0,
    count: 0,
    limitBytes: POOL_SIZE_LIMIT[id],
  }));
}

export function emptyCloudSyncUsage(source: CloudSyncUsageSource, error?: string): CloudSyncUsage {
  return {
    source,
    totalBytes: 0,
    limitBytes: MAX_USER_SYNC_BYTES,
    kinds: CLOUD_SYNC_KINDS.map((kind) => ({
      kind,
      ...SYNC_KIND_META[kind],
      bytes: 0,
      count: 0,
      limitBytes: KIND_SIZE_LIMIT[kind],
    })),
    pools: emptyPools(),
    error,
  };
}

export function summarizeSyncUsage(
  entries: Iterable<{ kind: CloudSyncKind; bytes: number }>,
  source: CloudSyncUsageSource,
  error?: string,
): CloudSyncUsage {
  const usage = emptyCloudSyncUsage(source, error);
  const byKind = new Map(usage.kinds.map((row) => [row.kind, row]));
  const byPool = new Map(usage.pools.map((row) => [row.id, row]));
  for (const entry of entries) {
    const row = byKind.get(entry.kind);
    if (!row || !(entry.bytes > 0) || !Number.isFinite(entry.bytes)) continue;
    row.bytes += entry.bytes;
    row.count += 1;
    const poolId = KIND_QUOTA_POOL[entry.kind];
    if (!poolId) continue;
    const pool = byPool.get(poolId);
    if (!pool) continue;
    pool.bytes += entry.bytes;
    pool.count += 1;
  }
  usage.totalBytes = usage.kinds.reduce((sum, row) => sum + row.bytes, 0);
  return usage;
}

export function summarizeSyncRows(rows: readonly SyncDocumentRow[], source: CloudSyncUsageSource = "cloud"): CloudSyncUsage {
  return summarizeSyncUsage(
    rows
      .filter((row) => !row.deleted)
      .map((row) => ({ kind: row.kind, bytes: payloadByteSize(row.payload) })),
    source,
  );
}

export function formatSyncBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)} MB`;
}
