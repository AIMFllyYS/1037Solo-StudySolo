import { applyRemoteRow, type RemoteApplyContext } from "./remoteApply";
import { syncUsageState, getCachedCloudSyncUsage, rememberRemoteBytesFromRows, noteRemoteBytes, cachedPoolBytes, remoteUserBytes } from "./quotaSnapshot";
export { getCachedCloudSyncUsage } from "./quotaSnapshot";
import { createDefaultStores } from "./stores";
import { ownerStillCurrent } from "./ownership";
import { asChatPayload, asUserNote, asReviewCard, cardVersion, asChatProject, loadLocalPayload } from "./payloadReaders";
import type { CloudSyncStores } from "./storeAdapterTypes";
export type { CloudSyncStores } from "./storeAdapterTypes";
import { pendingSyncJobs, persistSyncJournal, setJournalActive, type SyncJob } from './journal';
﻿import { tryGetBrowserDataClient } from "@/lib/auth/browserClient";
import { getBrowserSession } from "@/lib/auth/browserSession";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { registerResourceMetrics } from "@/lib/performance/resourceMetrics";
import { type SessionMeta } from "@/lib/storage/chatStorage";
import type { Artifact } from "@/lib/stores/artifacts";


import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";

import { createSupabaseSyncClient } from "./client";
import { isRemoteNewer, mergeChatSessionPayloads } from "./merge";

import { effectivePoolLimit, effectiveUserLimit, formatKindLimitMessage, formatPoolLimitMessage, formatUserLimitMessage, isSyncKindLimitError, isSyncPoolLimitError, isSyncUnknownKindError, isSyncUserLimitError, payloadByteSize, preparePayload, quotaPoolForKind, __setSyncLimitsForTests } from "./payload";

import { isSessionStreaming, __resetStreamingSessionsForTests } from "./streamingSessions";
import { getCloudSyncStatus, setCloudRowKeys, setCloudSyncStatus, setSyncItemStatus, getSyncItemStatus,resetSyncItemStatuses } from "./status";
import { retryableFailure, type SyncFailure } from './failure';
import { hasExternalBody } from '@/lib/assets/body';
import { hydrateRemotePayload } from '@/lib/assets/client';
import { mergeIndependent } from './conflicts';
import type { ImageGenSession } from '@/lib/stores/imageGen';
import {assetApi} from '@/lib/assets/client';
import {
  CLOUD_SYNC_KINDS,
  isCloudSyncKind,
  KIND_SIZE_LIMIT,
  type ChatProjectSyncPayload,
  type ChatSessionSyncPayload,
  type CloudSyncKind,
  type SyncDocumentsApi,
} from "./types";
import {
  emptyCloudSyncUsage,
  summarizeSyncRows,
  summarizeSyncUsage,
  type CloudSyncUsage,
} from "./usage";

const DEFAULT_DEBOUNCE_MS = 2000;

type Job = SyncJob;

let stores: CloudSyncStores = createDefaultStores();
let injectedClient: SyncDocumentsApi | null | undefined;
let debounceMs = DEFAULT_DEBOUNCE_MS;
const pending = pendingSyncJobs;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const baseline = new Map<string, string>();
const baselineRevisions=new Map<string,number>();
const lastOkBytes = new Map<string, number>();
const lastPushedHash = new Map<string, string>();
let chain: Promise<void> = Promise.resolve();
let drainScheduled = false;
let inFlightJob: Job | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
registerResourceMetrics(() => ({ syncPendingKeys: pending.size, syncInFlightJobs: inFlightJob ? 1 : 0 }));
let pagehideBound = false;

function jobKey(kind: CloudSyncKind, clientId: string): string {
  return `${kind}:${clientId}`;
}

function retryStorageKey(ownerId: string): string { return `ss-sync-jobs:${ownerId}`; }
function persistLightJobs(ownerId: string | null): void { persistSyncJournal(ownerId); }

function restoreLightJobs(ownerId: string | null): void {
  if (!ownerId || typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(retryStorageKey(ownerId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return;
    for (const candidate of parsed.slice(0, 10_000)) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      if (typeof row.kind !== "string" || !isCloudSyncKind(row.kind) || typeof row.clientId !== "string" || !row.clientId || row.clientId.length > 200 || (row.op !== "upsert" && row.op !== "tombstone")) continue;
      const job: Job = { kind: row.kind, clientId: row.clientId, op: row.op, ownerId, epoch: getOwnerEpoch(),mutationId:typeof row.mutationId==='string'?row.mutationId:undefined,expectedRevision:typeof row.expectedRevision==='number'?row.expectedRevision:undefined,fingerprint:typeof row.fingerprint==='string'?row.fingerprint:undefined };
      pending.set(jobKey(job.kind, job.clientId), job);
    }
  } catch { /* malformed derived queue is ignored; authoritative local objects remain */ }
}
let pullRetryNeeded = false;
function queueRetry(minimumDelay = 0): void {
  if (retryTimer || typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const delay = Math.max(minimumDelay, Math.round(Math.min(60_000, 1_000 * 2 ** Math.min(retryAttempt++, 6)) * (0.8 + Math.random() * 0.4)));
  retryTimer = setTimeout(() => { retryTimer = null; if (pullRetryNeeded) void pullAndPushAll(); else void flushPendingJobs(); }, delay);
}

onStorageOwnerChange((previous, next) => {
  persistLightJobs(previous);
  resetSyncItemStatuses();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null; retryAttempt = 0;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  pending.clear();
  pullRetryNeeded = false;
  baseline.clear();
  baselineRevisions.clear();
  if(next&&typeof localStorage!=='undefined')try{for(const [key,revision] of Object.entries(JSON.parse(localStorage.getItem(`ss-sync-heads:${next}`)??'{}')))if(Number.isSafeInteger(revision))baselineRevisions.set(key,Number(revision));}catch{}
  lastOkBytes.clear();
  lastPushedHash.clear();
  syncUsageState.remoteBytesByKey.clear();
  syncUsageState.remoteBytesReady = false;
  setCloudRowKeys(null);
  restoreLightJobs(next);
  if (pending.size) void flushPendingJobs();
});

export function __setCloudSyncStoresForTests(next: CloudSyncStores | null): void {
  stores = next ?? createDefaultStores();
  // 本地状态整体换了一套：远端 updated_at 基线随之失效，
  // 否则「远端未变」短路会跳过把数据灌进这套新 stores。
  baseline.clear();
}

export function __setSyncClientForTests(client: SyncDocumentsApi | null): void {
  injectedClient = client;
}

export function __setCloudSyncDebounceForTests(ms: number): void {
  debounceMs = ms;
}

export function __resetCloudSyncForTests(): void {
  injectedClient = undefined;
  stores = createDefaultStores();
  debounceMs = DEFAULT_DEBOUNCE_MS;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  pending.clear();
  pullRetryNeeded = false;
  inFlightJob = null;setJournalActive(null);
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null; retryAttempt = 0;
  baseline.clear();
  baselineRevisions.clear();
  lastOkBytes.clear();
  lastPushedHash.clear();
  syncUsageState.remoteBytesByKey = new Map();
  syncUsageState.remoteBytesReady = false;
  setCloudRowKeys(null);
  chain = Promise.resolve();
  drainScheduled = false;
  unknownKindWarned.clear();
  __setSyncLimitsForTests(null);
  __resetStreamingSessionsForTests();
}

async function resolveClient(): Promise<SyncDocumentsApi | null> {
  if (injectedClient !== undefined) return injectedClient;
  const supabase = tryGetBrowserDataClient();
  if (!supabase) return null;
  const userId = getBrowserSession()?.user.id ?? null;
  if (typeof userId !== "string" || !userId) return null;
  return createSupabaseSyncClient(supabase, userId);
}

async function measureLocalSyncUsage(): Promise<CloudSyncUsage> {
  const entries: { kind: CloudSyncKind; bytes: number }[] = [];
  for (const meta of stores.listSessionMetas()) {
    const payload = await loadLocalPayload(stores, "chat-session", meta.id);
    if (payload) entries.push({ kind: "chat-session", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listArtifactIds()) {
    const payload = await loadLocalPayload(stores, "artifact", id);
    if (payload) entries.push({ kind: "artifact", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listDocumentIds()) {
    const payload = await loadLocalPayload(stores, "document", id);
    if (payload) entries.push({ kind: "document", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listNoteIds()) {
    const payload = await loadLocalPayload(stores, "user-note", id);
    if (payload) entries.push({ kind: "user-note", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listCardIds()) {
    const payload = await loadLocalPayload(stores, "review-card", id);
    if (payload) entries.push({ kind: "review-card", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listProjectIds()) {
    const payload = await loadLocalPayload(stores, "chat-project", id);
    if (payload) entries.push({ kind: "chat-project", bytes: payloadByteSize(payload) });
  }
  return summarizeSyncUsage(entries, "local");
}

export async function loadCloudSyncUsage(): Promise<CloudSyncUsage> {
  const api = await resolveClient();
  if (api) {
    const { data, error } = await api.list(CLOUD_SYNC_KINDS);
    if (!error) {
      rememberRemoteBytesFromRows(data);
      const usage=summarizeSyncRows(data);
      if(injectedClient===undefined){try{const overview=await assetApi('?usage=1');return {...usage,totalBytes:Number(overview.storage.used_bytes),limitBytes:Number(overview.storage.capacity_bytes)};}catch(error){return {...usage,error:error instanceof Error?error.message:'个人额度暂不可读取。'};}}
      return usage;
    }
    const cached = getCachedCloudSyncUsage();
    if (cached) return { ...cached, error: error.message };
    return emptyCloudSyncUsage("cloud", error.message);
  }
  return measureLocalSyncUsage();
}

function bindPagehideFlush(): void {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  const flush = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    void flushPendingJobs();
  };
  window.addEventListener("pagehide", flush);
  const resume = () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; retryAttempt = 0; void pullAndPushAll(); };
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else resume();
  });
}

function enqueue(job: Job): void {
  bindPagehideFlush();
  const key = jobKey(job.kind, job.clientId);
  pending.set(key, job);
  setSyncItemStatus(key, { phase: 'pending' });
  persistLightJobs(job.ownerId);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  if (debounceMs <= 0) {
    timers.delete(key);
    void flushPendingJobs();
    return;
  }
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void flushPendingJobs();
    }, debounceMs),
  );
}

export function activateSyncIntent(job: SyncJob): void {
  if(pending.get(jobKey(job.kind,job.clientId))===job && ownerStillCurrent(job.ownerId,job.epoch))enqueue(job);
}

export function enqueueUpsert(kind: CloudSyncKind, clientId: string): void {
  enqueue({ op: "upsert", kind, clientId, ownerId: getStorageOwner(), epoch: getOwnerEpoch() });
}

export function enqueueTombstone(kind: CloudSyncKind, clientId: string): void {
  enqueue({ op: "tombstone", kind, clientId, ownerId: getStorageOwner(), epoch: getOwnerEpoch(), expectedRevision: baselineRevisions.get(jobKey(kind,clientId)) });
}

async function flushPendingJobs(): Promise<void> {
  if (drainScheduled || pending.size === 0) return chain;
  drainScheduled = true;
  chain = chain.catch(() => {}).then(async () => {
    const attempted = new Map<string, Job>();
    // Pending stores only kind/id/owner. Each iteration loads at most one full payload;
    // updates during an in-flight upload replace the one pending job for that key.
    while (pending.size > 0) {
      const first = [...pending.entries()].find(([key, job]) => attempted.get(key) !== job);
      if (!first) break;
      const [key, job] = first;
      attempted.set(key, job);
      if (!ownerStillCurrent(job.ownerId, job.epoch)) { pending.delete(key); continue; }
      setSyncItemStatus(key, { phase: 'syncing' });
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const api = await resolveClient();
      if (!api) break;
      if (!ownerStillCurrent(job.ownerId, job.epoch)) { pending.delete(key); continue; }
      pending.delete(key);
      inFlightJob = job;setJournalActive(job);
      persistLightJobs(job.ownerId);
      try {
        const committed = job.op === "tombstone"
          ? await pushTombstone(api, job.kind, job.clientId, job)
          : await pushOne(api, job.kind, job.clientId, job);
        if (!committed && ownerStillCurrent(job.ownerId, job.epoch)) {
          if (!pending.has(key)) pending.set(key, job);
          const state = getSyncItemStatus(key);
          if (state?.retryable !== false) queueRetry(state?.retryAfterMs);
          continue;
        }
        if(!ownerStillCurrent(job.ownerId,job.epoch))continue;
        retryAttempt = 0;
        if(getSyncItemStatus(key)?.phase!=='conflict')setSyncItemStatus(key, { phase: 'synced' });
      } catch (error) {
        if (ownerStillCurrent(job.ownerId, job.epoch) && !pending.has(key)) pending.set(key, job);
        const message = `云端同步失败：${error instanceof Error ? error.message : "未知错误"}`;
        reportError(message);
        setSyncItemStatus(key, { phase: 'error', message, retryable: true });
        queueRetry();
        continue;
      } finally {
        if (inFlightJob === job) {inFlightJob = null;setJournalActive(null);}
        if (ownerStillCurrent(job.ownerId, job.epoch)) persistLightJobs(job.ownerId);
      }
    }
    if (!pending.size && !pullRetryNeeded) setCloudSyncStatus({ phase: 'idle', message: null });
  }).finally(() => { drainScheduled = false; });
  await chain;
}

export async function flushCloudSyncForTests(): Promise<void> {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  await flushPendingJobs();
  await chain;
}
export async function loadOneCloudAsset(kind:CloudSyncKind,id:string):Promise<boolean>{
 const owner=getStorageOwner(),epoch=getOwnerEpoch(),api=await resolveClient();if(!api)return false;
 const row=await api.get(kind,id);if(row.error||!row.data||!ownerStillCurrent(owner,epoch))return false;
 const applied=await applyRemoteRow(remoteApplyContext, row.data);if(applied==='skipped'||!ownerStillCurrent(owner,epoch))return false;
 rememberBaseline(kind,id,row.data.updated_at,row.data.revision);return true;
}
export async function cancelConflictingDelete(kind: CloudSyncKind, id: string): Promise<void> {
  const key = jobKey(kind,id), owner = getStorageOwner(), epoch = getOwnerEpoch(), job = pending.get(key);
  if (!job || job.op !== 'tombstone' || getSyncItemStatus(key)?.phase !== 'conflict') throw new Error('删除状态已变化，请刷新后重试。');
  if (inFlightJob && jobKey(inFlightJob.kind,inFlightJob.clientId) === key) throw new Error('此项正在处理，请稍后重试。');
  pending.delete(key);
  if (timers.has(key)) clearTimeout(timers.get(key));
  timers.delete(key); persistLightJobs(owner);
  setSyncItemStatus(key,{phase:'conflict',message:'本机删除已取消，正在读取保留的云端版本。',retryable:true});
  baseline.delete(key);
  if (!await loadOneCloudAsset(kind,id)) throw new Error('删除已取消；云端正文暂不可读取，请刷新重试。');
  if (ownerStillCurrent(owner,epoch)) setSyncItemStatus(key,{phase:'synced'});
}

async function payloadFingerprint(payload: unknown): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle) return "";
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function rememberBaseline(kind: CloudSyncKind, clientId: string, updatedAt: string | undefined, revision?:number): void {
  if (!updatedAt) return;
  baseline.set(jobKey(kind, clientId), updatedAt);
  if(revision!==undefined){baselineRevisions.set(jobKey(kind,clientId),revision);const owner=getStorageOwner();if(owner&&typeof localStorage!=='undefined')try{localStorage.setItem(`ss-sync-heads:${owner}`,JSON.stringify(Object.fromEntries(baselineRevisions)));}catch{}}
}

function reportError(message: string): void {
  setCloudSyncStatus({ phase: "error", message });
}

function recordFailure(kind: CloudSyncKind, id: string, error: SyncFailure): void {
  const retryable = retryableFailure(error);
  setSyncItemStatus(jobKey(kind, id), { phase: error.code === 'REVISION_CONFLICT' ? 'conflict' : retryable ? 'error' : 'blocked', message: error.message, retryable, retryAfterMs: error.retryAfterMs, operation: inFlightJob?.op==='tombstone'?'delete':'save' });
}

function reportMerged(): void {
  setCloudSyncStatus({
    phase: "merged",
    message: "已与另一台设备上的对话合并，消息都保留了。",
  });
}

/** 云端还不认识这个 kind（迁移没跑）时只提示一次，之后安静地只留本机。 */
const unknownKindWarned = new Set<CloudSyncKind>();
function reportUnknownKindOnce(kind: CloudSyncKind): void {
  if (unknownKindWarned.has(kind)) return;
  unknownKindWarned.add(kind);
  const label = kind === "chat-project" ? "项目名" : kind;
  reportError(`云端还不认识「${label}」这类同步数据，已改为只保留本机；云端升级后会自动补传。`);
}

async function pushTombstone(api: SyncDocumentsApi, kind: CloudSyncKind, clientId: string, job?: Job): Promise<boolean> {
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  const previous = await api.get(kind, clientId,{metadataOnly:true});
  if (previous.error) { recordFailure(kind, clientId, previous.error); return false; }
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  const known = job?.expectedRevision ?? baselineRevisions.get(jobKey(kind,clientId));
  if (known === undefined && previous.data && !previous.data.deleted && (previous.data.revision??0)>0) {
    setSyncItemStatus(jobKey(kind,clientId),{phase:'conflict',operation:'delete',message:'尚未核对云端版本，删除未执行；请保留云端版本后重新确认。',retryable:false});return false;
  }
  const expected = known ?? previous.data?.revision ?? 0;
  if (previous.data && !previous.data.deleted && previous.data.revision !== undefined && previous.data.revision !== expected) {
    setSyncItemStatus(jobKey(kind,clientId), {phase:'conflict',operation:'delete',message:'云端已有未见的新修改，删除尚未执行。可保留云端版本并取消本机删除。',retryable:false});
    return false;
  }
  const { data, error } = await api.upsert({
    kind,
    client_id: clientId,
    payload: {},
    deleted: true,
    expectedRevision: expected,
    mutationId: crypto.randomUUID(),
  });
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (error) {
    recordFailure(kind, clientId, error);
    reportError(`云端同步失败：${error.message}`);
    return false;
  }
  rememberBaseline(kind, clientId, data?.updated_at, data?.revision);
  noteRemoteBytes(kind, clientId, 0, true);
  lastPushedHash.delete(jobKey(kind, clientId));
  lastOkBytes.delete(jobKey(kind, clientId));
  return true;
}

async function pushOne(api: SyncDocumentsApi, kind: CloudSyncKind, clientId: string, job?: Job): Promise<boolean> {
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  const local = await loadLocalPayload(stores, kind, clientId);
  if ((kind === 'document' || kind === 'artifact' || kind==='image-gen') && local && (local as { status?: string }).status !== 'done') {setSyncItemStatus(jobKey(kind,clientId),{phase:'blocked',message:'未完成稿仅保留本机。',retryable:false});return false;}
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (!local) {
    return pushTombstone(api, kind, clientId, job);
  }

  const { data: remote, error: getError } = await api.get(kind, clientId,{metadataOnly:true});
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (getError) {
    recordFailure(kind, clientId, getError);
    reportError(`云端同步失败：${getError.message}`);
    return false;
  }

  let toUpload: unknown = local;
  const knownRevision=baselineRevisions.get(jobKey(kind,clientId));
  if(remote&&!remote.deleted&&hasExternalBody(remote.payload)&&knownRevision!==remote.revision){remote.payload=await hydrateRemotePayload(kind,clientId,remote.revision);if(job&&!ownerStillCurrent(job.ownerId,job.epoch))return false;}
  if(remote&&remote.revision!==undefined&&remote.deleted)return preserveConflict(api,kind,clientId,local,job);
  if(remote&&!remote.deleted&&remote.revision!==undefined&&knownRevision===undefined&&remote.revision>0&&JSON.stringify(local)!==JSON.stringify(remote.payload))return preserveConflict(api,kind,clientId,local,job);
  if(remote&&!remote.deleted&&remote.revision!==undefined&&knownRevision!==undefined&&remote.revision!==knownRevision){
    let base:unknown=null;try{base=await hydrateRemotePayload(kind,clientId,knownRevision);}catch{}
    if(job&&!ownerStillCurrent(job.ownerId,job.epoch))return false;
    const merged=mergeIndependent(base,local,remote.payload,kind);
    if(!merged)return preserveConflict(api,kind,clientId,local,job);
    toUpload=merged;
  }
  if (kind === "user-note" && remote && !remote.deleted && remote.revision===undefined) {
    const localNote = asUserNote(local);
    const remoteNote = asUserNote(remote.payload);
    if (localNote && remoteNote && remoteNote.updatedAt > localNote.updatedAt) {
      const remoteHash = await payloadFingerprint(remote.payload);
      if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
      stores.applyNote(remoteNote);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), remoteHash);
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return true;
    }
  }
  if (kind === "review-card" && remote && !remote.deleted && remote.revision===undefined) {
    const localCard = asReviewCard(local);
    const remoteCard = asReviewCard(remote.payload);
    // 与 user-note 分支同构：云端更新就采用云端并放弃本次上传。
    //
    // 这个分支过去不存在，于是只要本机对同一张卡有任何改动（哪怕只是换科目），
    // 就会无条件把本机副本 upsert 上去，静默覆盖别处（如 Platform Wiki）的编辑。
    if (localCard && remoteCard && cardVersion(remoteCard) > cardVersion(localCard)) {
      const remoteHash = await payloadFingerprint(remote.payload);
      if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
      stores.applyCard(remoteCard);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), remoteHash);
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return true;
    }
  }
  if (kind === "chat-project" && remote && !remote.deleted && remote.revision===undefined) {
    const localProject = asChatProject(local);
    const remoteProject = asChatProject(remote.payload);
    // 项目没有正文可合并：谁的 updatedAt 新听谁的。
    if (localProject && remoteProject && remoteProject.updatedAt > localProject.updatedAt) {
      const remoteHash = await payloadFingerprint(remote.payload);
      if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
      stores.applyProject(remoteProject);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), remoteHash);
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return true;
    }
  }
  if (kind === "chat-session" && remote && !remote.deleted && remote.revision===undefined) {
    const known = baseline.get(jobKey(kind, clientId));
    if (isRemoteNewer(remote.updated_at, known)) {
      const localPayload = asChatPayload(local);
      const remotePayload = asChatPayload(remote.payload);
      if (localPayload && remotePayload) {
        const merged = mergeChatSessionPayloads(localPayload, remotePayload);
        toUpload = merged.payload;
        await stores.applySession(merged.payload);
        if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
        if (merged.added > 0) reportMerged();
      }
    }
  }

  const prepared = preparePayload(kind, toUpload);
  if (!prepared.ok) {
    setSyncItemStatus(jobKey(kind, clientId), { phase: 'blocked', message: '内容超过限制或无法安全同步', retryable: false });
    if (prepared.reason === "kind-limit") {
      reportError(formatKindLimitMessage(kind, prepared.bytes, prepared.limit, lastOkBytes.get(jobKey(kind, clientId))));
    } else {
      reportError("同步内容含图片或密钥，已跳过上传。本机仍保留。");
    }
    return false;
  }

  const hash = await payloadFingerprint(prepared.payload);
  if(job&&job.fingerprint!==hash){job.mutationId=crypto.randomUUID();job.fingerprint=hash;job.expectedRevision=remote?.revision??0;persistLightJobs(job.ownerId);}
  const remoteHash = remote && !remote.deleted ? await payloadFingerprint(remote.payload) : "";
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (hash && (lastPushedHash.get(jobKey(kind, clientId)) === hash || remoteHash === hash)) {
    rememberBaseline(kind, clientId, remote?.updated_at, remote?.revision);
    lastPushedHash.set(jobKey(kind, clientId), hash);
    lastOkBytes.set(jobKey(kind, clientId), prepared.bytes);
    noteRemoteBytes(kind, clientId, prepared.bytes, false);
    return true;
  }

  const total = await remoteUserBytes(api, kind, clientId, job);
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (total.error) {
    reportError(`云端同步失败：${total.error}`);
    return false;
  }
  if (total.bytes + prepared.bytes > effectiveUserLimit()) {
    reportError(formatUserLimitMessage(effectiveUserLimit()));
    return false;
  }
  const pool = quotaPoolForKind(kind);
  if (pool) {
    const poolBytes = cachedPoolBytes(pool, kind, clientId);
    if (poolBytes + prepared.bytes > effectivePoolLimit(pool)) {
      reportError(formatPoolLimitMessage(pool, effectivePoolLimit(pool)));
      return false;
    }
  }

  const { data, error } = await api.upsert({
    kind,
    client_id: clientId,
    payload: prepared.payload,
    deleted: false,
    expectedRevision: job?.expectedRevision ?? remote?.revision ?? 0,
    mutationId: job?.mutationId ?? crypto.randomUUID(),
  });
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (error) {
    recordFailure(kind, clientId, error);
    if(error.code==='REVISION_CONFLICT')return preserveConflict(api,kind,clientId,toUpload,job);
    if (isSyncKindLimitError(error.message)) {
      reportError(formatKindLimitMessage(kind, prepared.bytes, prepared.bytes, lastOkBytes.get(jobKey(kind, clientId))));
    } else if (isSyncUserLimitError(error.message)) {
      reportError(formatUserLimitMessage(effectiveUserLimit()));
    } else if (isSyncPoolLimitError(error.message)) {
      const pool = quotaPoolForKind(kind);
      reportError(formatPoolLimitMessage(pool ?? "notes", pool ? effectivePoolLimit(pool) : effectiveUserLimit()));
    } else if (isSyncUnknownKindError(error.message)) {
      reportUnknownKindOnce(kind);
    } else {
      reportError(`云端同步失败：${error.message}`);
    }
    return false;
  }
  rememberBaseline(kind, clientId, data?.updated_at, data?.revision);
  lastPushedHash.set(jobKey(kind, clientId), hash);
  lastOkBytes.set(jobKey(kind, clientId), prepared.bytes);
  noteRemoteBytes(kind, clientId, prepared.bytes, false);
  return true;
}

async function preserveConflict(api:SyncDocumentsApi,kind:CloudSyncKind,id:string,source:unknown,job?:Job):Promise<boolean>{
  const copy=structuredClone(source) as Record<string,unknown>,copyId=`conflict-${crypto.randomUUID()}`;
  if(kind==='chat-session'){const meta=copy.meta as SessionMeta;copy.meta={...meta,id:copyId,title:`${meta.title}（冲突副本）`,contextCheckpoint:undefined,conflictOf:{kind,id}};}
  else{copy.id=copyId;if(kind==='document'){copy.spec={...(copy.spec as object),title:`${(copy.spec as {title:string}).title}（冲突副本）`};}else copy.title=`${String(copy.title??copy.front??id)}（冲突副本）`;}
  copy.conflictOf={kind,id};
  const owner=job?.ownerId??getStorageOwner();
  if(owner){const {writeOwnedStorageItem}=await import('@/lib/storage/idbStorage');if(!await writeOwnedStorageItem(owner,`sync-conflict:${copyId}`,JSON.stringify(copy)))throw new Error('冲突副本落盘失败，原修改未覆盖。');}
  if(job&&!ownerStillCurrent(job.ownerId,job.epoch))return false;
  if(kind==='artifact')await stores.applyArtifact(copy as unknown as Artifact);
  else if(kind==='document')await stores.applyDocument(copy as unknown as StoredDocument);
  else if(kind==='user-note')stores.applyNote(copy as unknown as UserNote);
  else if(kind==='review-card')stores.applyCard(copy as unknown as ReviewCard);
  else if(kind==='chat-session')await stores.applySession(copy as unknown as ChatSessionSyncPayload);
  else if(kind==='image-gen')await stores.applyImage?.(copy as unknown as ImageGenSession);
  else stores.applyProject(copy as unknown as ChatProjectSyncPayload);
  const next:Job={op:'upsert',kind,clientId:copyId,ownerId:owner,epoch:getOwnerEpoch()};pending.set(jobKey(kind,copyId),next);persistLightJobs(owner);
  setSyncItemStatus(jobKey(kind,id),{phase:'conflict',message:'双方内容已保留，修改另存为冲突副本。',retryable:false});
  const remote=await api.get(kind,id);
  if(job&&!ownerStillCurrent(job.ownerId,job.epoch))return false;
  if(remote.error)return true;
  if(remote.data){rememberBaseline(kind,id,remote.data.updated_at,remote.data.revision);if(!pending.has(jobKey(kind,id))){
    if(remote.data.deleted){
      if(kind==='chat-session')await stores.forgetSession(id);
      else if(kind==='artifact')stores.forgetArtifact(id);
      else if(kind==='document')stores.forgetDocument(id);
      else if(kind==='user-note')stores.forgetNote(id);
      else if(kind==='review-card')stores.forgetCard(id);
      else if(kind==='image-gen')stores.forgetImage?.(id);
      else stores.forgetProject(id);
      return true;
    }
    if(kind==='artifact')await stores.applyArtifact(remote.data.payload as Artifact);
    else if(kind==='document')await stores.applyDocument(remote.data.payload as StoredDocument);
    else if(kind==='user-note')stores.applyNote(remote.data.payload as UserNote);
    else if(kind==='chat-session')await stores.applySession(remote.data.payload as ChatSessionSyncPayload);
    else if(kind==='review-card')stores.applyCard(remote.data.payload as ReviewCard);
    else if(kind==='image-gen')await stores.applyImage?.(remote.data.payload as ImageGenSession);
    else if(kind==='chat-project')stores.applyProject(remote.data.payload as ChatProjectSyncPayload);
  }}
  return true;
}


const remoteApplyContext: RemoteApplyContext = {
  get stores() { return stores; },
  isDirty: (kind, id) => {
    const key = jobKey(kind, id);
    return pending.has(key) || ['pending', 'syncing', 'blocked', 'error'].includes(getSyncItemStatus(key)?.phase ?? '') || !!(inFlightJob && jobKey(inFlightJob.kind, inFlightJob.clientId) === key);
  },
  baselineFor: (kind, id) => baseline.get(jobKey(kind, id)),
  onMerged: reportMerged,
};

async function pullFromCloud(api: SyncDocumentsApi, ownerId: string | null, epoch: number): Promise<boolean> {
  syncUsageState.remoteBytesByKey = new Map();
  syncUsageState.remoteBytesReady = false;
  let cursor: string | undefined;
  // listPage is bounded for the canonical client; legacy injected clients remain a single array adapter.
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    if (!ownerStillCurrent(ownerId, epoch)) return false;
    const page = api.listPage
      ? await api.listPage(CLOUD_SYNC_KINDS, cursor)
      : { ...(await api.list(CLOUD_SYNC_KINDS)), nextCursor: null };
    if (!ownerStillCurrent(ownerId, epoch)) return false;
    if (page.error) { reportError(`云端同步失败：${page.error.message}`); pullRetryNeeded = retryableFailure(page.error); if (pullRetryNeeded) queueRetry(page.error.retryAfterMs); return false; }
    for (const row of page.data) {
      if (!row.deleted) syncUsageState.remoteBytesByKey.set(jobKey(row.kind, row.client_id), payloadByteSize(row.payload));
    }
    for (const deleted of [true, false]) {
      for (const row of page.data) {
        if (row.deleted !== deleted) continue;
        if (!ownerStillCurrent(ownerId, epoch)) return false;
        try {
          const applied=await applyRemoteRow(remoteApplyContext, row);
          if (!ownerStillCurrent(ownerId, epoch)) return false;
          if(applied!=='skipped')rememberBaseline(row.kind, row.client_id, row.updated_at, row.revision);
        } catch (error) {
          reportError(`云端第 ${pageNumber + 1} 页应用失败：${error instanceof Error ? error.message : "未知错误"}`);
          return false;
        }
      }
    }
    if (!page.nextCursor) {
      syncUsageState.remoteBytesReady = true;
      pullRetryNeeded = false;
      setCloudRowKeys(syncUsageState.remoteBytesByKey.keys());
      return true;
    }
    cursor = page.nextCursor;
  }
  reportError("云端同步分页超过安全上限；未应用不完整快照作为全量结果");
  return false;
}

const PUSH_CONCURRENCY = 6;
const PUSH_PAYLOAD_BUDGET = 6 * 1024 * 1024;

async function pushAllLocal(api: SyncDocumentsApi, ownerId: string | null, epoch: number): Promise<void> {
  const push = async (kind: CloudSyncKind, id: string) => {
    const key = jobKey(kind, id);
    if (pending.has(key)) return false;
    if (stores.hasCloudRevision?.(kind, id)) return true;
    const job: Job = { op: 'upsert', kind, clientId: id, ownerId, epoch };
    const committed = await pushOne(api, kind, id, job);
    if (!ownerStillCurrent(ownerId, epoch)) return false;
    if (!committed) { pending.set(key, job); persistLightJobs(ownerId); const state = getSyncItemStatus(key); if (state?.retryable !== false) queueRetry(state?.retryAfterMs); }
    else setSyncItemStatus(key, { phase: 'synced' });
    return committed;
  };
  // Reserve each kind's maximum payload before loading it. Six large sessions
  // must never be materialized at the same time merely because HTTP permits six requests.
  const jobs: Array<{ kind: CloudSyncKind; run: () => Promise<boolean> }> = [
    ...stores.listSessionMetas()
      .filter((meta) => !isSessionStreaming(meta.id))
      .map((meta) => ({ kind: "chat-session" as const, run: () => push("chat-session", meta.id) })),
    ...stores.listArtifactIds().map((id) => ({ kind: "artifact" as const, run: () => push("artifact", id) })),
    ...stores.listDocumentIds().map((id) => ({ kind: "document" as const, run: () => push("document", id) })),
    ...stores.listNoteIds().map((id) => ({ kind: "user-note" as const, run: () => push("user-note", id) })),
    ...stores.listCardIds().map((id) => ({ kind: "review-card" as const, run: () => push("review-card", id) })),
    ...stores.listProjectIds().map((id) => ({ kind: "chat-project" as const, run: () => push("chat-project", id) })),
    ...(stores.listImageIds?.()??[]).map(id=>({kind:'image-gen' as const,run:()=>push('image-gen',id)})),
  ];
  let next = 0;
  while (next < jobs.length && ownerStillCurrent(ownerId, epoch)) {
    const batch: typeof jobs = [];
    let reservedBytes = 0;
    while (next < jobs.length && batch.length < PUSH_CONCURRENCY) {
      const job = jobs[next];
      const weight = Math.min(PUSH_PAYLOAD_BUDGET, KIND_SIZE_LIMIT[job.kind]);
      if (batch.length && reservedBytes + weight > PUSH_PAYLOAD_BUDGET) break;
      batch.push(job); reservedBytes += weight; next++;
    }
    await Promise.all(batch.map((job) => job.run()));
  }
}

export async function pullAndPushAll(): Promise<void> {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  const api = await resolveClient();
  if (!api || !ownerStillCurrent(ownerId, epoch)) return;
  await flushPendingJobs();
  if (!ownerStillCurrent(ownerId, epoch)) return;
  // A failed local tombstone must not be undone by pulling the still-live remote row.
  // Dirty rows are skipped individually by applyRemoteRow; healthy rows still pull.
  setCloudSyncStatus({ phase: "syncing", message: null });
  chain = chain.catch(() => {}).then(async () => {
    const complete = await pullFromCloud(api, ownerId, epoch);
    if (!complete || !ownerStillCurrent(ownerId, epoch)) return;
    await pushAllLocal(api, ownerId, epoch);
    if (!ownerStillCurrent(ownerId, epoch)) return;
    const current = getCloudSyncStatus();
    if (current.phase === "syncing") {
      setCloudSyncStatus({ phase: "idle", message: current.message });
    }
  }).catch((error) => { reportError(`云端同步失败：${error instanceof Error ? error.message : "未知错误"}`); });
  await chain;
}
