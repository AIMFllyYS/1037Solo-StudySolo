import { tryGetBrowserDataClient } from "@/lib/auth/browserClient";
import { getBrowserSession } from "@/lib/auth/browserSession";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { registerResourceMetrics } from "@/lib/performance/resourceMetrics";
import {
  deleteSessionData,
  isSystemProject,
  listBlobIdsForSession,
  loadSessionMessages,
  manifestFrom,
  saveManifest,
  saveManifestCommitted,
  saveSessionMessagesCommitted,
  type ChatFolder,
  type SessionMeta,
} from "@/lib/storage/chatStorage";
import { loadArtifactFull, persistArtifactBody, useArtifacts, type Artifact } from "@/lib/stores/artifacts";
import { applyCloudSessionWindow, ensureChatHistoryBootstrap, useChatHistory } from "@/lib/stores/chatHistory";
import { loadDocumentFull, persistDocumentBody, useDocuments } from "@/lib/stores/documents";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import type { ChatMessage } from "@/lib/types/chat";
import { createSupabaseSyncClient } from "./client";
import { isRemoteNewer, mergeChatSessionPayloads } from "./merge";
import { compactStudyMessages } from "@/lib/chat/compactStudyParts";
import { htmlToSummary } from "@/lib/context/compactArtifacts";
import {
  buildArtifactPayload,
  buildChatProjectPayload,
  buildChatSessionPayload,
  buildDocumentPayload,
  buildReviewCardPayload,
  buildUserNotePayload,
  effectivePoolLimit,
  effectiveUserLimit,
  formatKindLimitMessage,
  formatPoolLimitMessage,
  formatUserLimitMessage,
  isSyncKindLimitError,
  isSyncPoolLimitError,
  isSyncUnknownKindError,
  isSyncUserLimitError,
  payloadByteSize,
  preparePayload,
  quotaPoolForKind,
  __setSyncLimitsForTests,
} from "./payload";
import { beginCloudSyncApply, endCloudSyncApply } from "./schedule";
import { isSessionStreaming, __resetStreamingSessionsForTests } from "./streamingSessions";
import { getCloudSyncStatus, setCloudRowKeys, setCloudSyncStatus } from "./status";
import {
  CLOUD_SYNC_KINDS,
  isCloudSyncKind,
  KIND_SIZE_LIMIT,
  type ChatProjectSyncPayload,
  type ChatSessionSyncPayload,
  type CloudSyncKind,
  type SyncDocumentRow,
  type SyncDocumentsApi,
  type SyncQuotaPool,
} from "./types";
import {
  emptyCloudSyncUsage,
  summarizeSyncRows,
  summarizeSyncUsage,
  type CloudSyncUsage,
} from "./usage";

const DEFAULT_DEBOUNCE_MS = 2000;
const MAX_LOCAL_SESSIONS = 50;

type JobOp = "upsert" | "tombstone";
type Job = { op: JobOp; kind: CloudSyncKind; clientId: string; ownerId: string | null; epoch: number };

export interface CloudSyncStores {
  listSessionMetas: () => SessionMeta[];
  loadSession: (id: string) => Promise<{ meta: SessionMeta; messages: ChatMessage[] } | null>;
  applySession: (payload: ChatSessionSyncPayload) => void | Promise<void>;
  forgetSession: (id: string) => void | Promise<void>;
  listArtifactIds: () => string[];
  getArtifact: (id: string) => Artifact | null | Promise<Artifact | null>;
  applyArtifact: (artifact: Artifact) => void | Promise<void>;
  forgetArtifact: (id: string) => void;
  listDocumentIds: () => string[];
  getDocument: (id: string) => StoredDocument | null | Promise<StoredDocument | null>;
  applyDocument: (doc: StoredDocument) => void | Promise<void>;
  forgetDocument: (id: string) => void;
  listNoteIds: () => string[];
  getNote: (id: string) => UserNote | null;
  applyNote: (note: UserNote) => void;
  forgetNote: (id: string) => void;
  listCardIds: () => string[];
  getCard: (id: string) => ReviewCard | null;
  applyCard: (card: ReviewCard) => void;
  forgetCard: (id: string) => void;
  listProjectIds: () => string[];
  getProject: (id: string) => ChatProjectSyncPayload | null;
  applyProject: (project: ChatProjectSyncPayload) => void;
  forgetProject: (id: string) => void;
}

function createDefaultStores(): CloudSyncStores {
  return {
    listSessionMetas: () => useChatHistory.getState().sessionsMeta,
    async loadSession(id) {
      const meta = useChatHistory.getState().sessionsMeta.find((item) => item.id === id);
      if (!meta) return null;
      // 窗口化后 messagesById 只是尾部窗口，上行 payload 必须全量装配，
      // 否则云端拿到的就是「只剩最近几轮」的截断会话。
      const messages = (await loadSessionMessages(id)) ?? [];
      return { meta, messages };
    },
    applySession: applyChatPayloadToZustand,
    forgetSession: forgetLocalSessionInZustand,
    listArtifactIds: () => useArtifacts.getState().order,
    getArtifact: loadArtifactFull,
    applyArtifact: applyArtifactToZustand,
    forgetArtifact: forgetArtifactInZustand,
    listDocumentIds: () => Object.keys(useDocuments.getState().byId),
    getDocument: loadDocumentFull,
    applyDocument: applyDocumentToZustand,
    forgetDocument: forgetDocumentInZustand,
    listNoteIds: () => useUserNotes.getState().order,
    getNote: (id) => useUserNotes.getState().byId[id] ?? null,
    applyNote: applyNoteToZustand,
    forgetNote: forgetNoteInZustand,
    listCardIds: () => useReviewCards.getState().order,
    getCard: (id) => useReviewCards.getState().byId[id] ?? null,
    applyCard: applyCardToZustand,
    forgetCard: forgetCardInZustand,
    listProjectIds: () => useChatHistory.getState().folders.map((folder) => folder.id),
    getProject: (id) => {
      const folder = useChatHistory.getState().folders.find((item) => item.id === id);
      if (!folder) return null;
      return {
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt ?? folder.createdAt,
        ...(folder.system ? { system: folder.system } : {}),
      };
    },
    applyProject: applyProjectToZustand,
    forgetProject: forgetProjectInZustand,
  };
}

let stores: CloudSyncStores = createDefaultStores();
let injectedClient: SyncDocumentsApi | null | undefined;
let debounceMs = DEFAULT_DEBOUNCE_MS;
const pending = new Map<string, Job>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const baseline = new Map<string, string>();
const lastOkBytes = new Map<string, number>();
const lastPushedHash = new Map<string, string>();
let remoteBytesByKey = new Map<string, number>();
let remoteBytesReady = false;
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

function ownerStillCurrent(ownerId: string | null, epoch: number): boolean {
  return getStorageOwner() === ownerId && getOwnerEpoch() === epoch;
}

function retryStorageKey(ownerId: string): string { return `ss-sync-jobs:${ownerId}`; }
function persistLightJobs(ownerId: string | null): void {
  if (!ownerId || typeof localStorage === "undefined") return;
  const jobs = [...(inFlightJob?.ownerId === ownerId ? [inFlightJob] : []), ...pending.values()]
    .filter((job) => job.ownerId === ownerId)
    .map(({ kind, clientId, op }) => ({ kind, clientId, op }));
  try { localStorage.setItem(retryStorageKey(ownerId), JSON.stringify(jobs)); } catch { /* memory queue remains */ }
}
function restoreLightJobs(ownerId: string | null): void {
  if (!ownerId || typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(retryStorageKey(ownerId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return;
    for (const candidate of parsed.slice(0, 10_000)) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      if (typeof row.kind !== "string" || !isCloudSyncKind(row.kind) || typeof row.clientId !== "string" || !row.clientId || row.clientId.length > 200 || (row.op !== "upsert" && row.op !== "tombstone")) continue;
      const job: Job = { kind: row.kind, clientId: row.clientId, op: row.op, ownerId, epoch: getOwnerEpoch() };
      pending.set(jobKey(job.kind, job.clientId), job);
    }
  } catch { /* malformed derived queue is ignored; authoritative local objects remain */ }
}
function queueRetry(): void {
  if (retryTimer || typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const delay = Math.min(60_000, 1_000 * 2 ** Math.min(retryAttempt++, 6));
  retryTimer = setTimeout(() => { retryTimer = null; void flushPendingJobs(); }, Math.round(delay * (0.8 + Math.random() * 0.4)));
}

onStorageOwnerChange((previous, next) => {
  persistLightJobs(previous);
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null; retryAttempt = 0;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  pending.clear();
  baseline.clear();
  lastOkBytes.clear();
  lastPushedHash.clear();
  remoteBytesByKey.clear();
  remoteBytesReady = false;
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
  inFlightJob = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null; retryAttempt = 0;
  baseline.clear();
  lastOkBytes.clear();
  lastPushedHash.clear();
  remoteBytesByKey = new Map();
  remoteBytesReady = false;
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

function parseJobKey(key: string): CloudSyncKind | null {
  for (const kind of CLOUD_SYNC_KINDS) {
    if (key.startsWith(`${kind}:`)) return kind;
  }
  return null;
}

export function getCachedCloudSyncUsage(): CloudSyncUsage | null {
  if (!remoteBytesReady) return null;
  return summarizeSyncUsage(
    [...remoteBytesByKey].flatMap(([key, bytes]) => {
      const kind = parseJobKey(key);
      return kind && bytes > 0 ? [{ kind, bytes }] : [];
    }),
    "cloud",
  );
}

async function measureLocalSyncUsage(): Promise<CloudSyncUsage> {
  const entries: { kind: CloudSyncKind; bytes: number }[] = [];
  for (const meta of stores.listSessionMetas()) {
    const payload = await loadLocalPayload("chat-session", meta.id);
    if (payload) entries.push({ kind: "chat-session", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listArtifactIds()) {
    const payload = await loadLocalPayload("artifact", id);
    if (payload) entries.push({ kind: "artifact", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listDocumentIds()) {
    const payload = await loadLocalPayload("document", id);
    if (payload) entries.push({ kind: "document", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listNoteIds()) {
    const payload = await loadLocalPayload("user-note", id);
    if (payload) entries.push({ kind: "user-note", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listCardIds()) {
    const payload = await loadLocalPayload("review-card", id);
    if (payload) entries.push({ kind: "review-card", bytes: payloadByteSize(payload) });
  }
  for (const id of stores.listProjectIds()) {
    const payload = await loadLocalPayload("chat-project", id);
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
      return summarizeSyncRows(data);
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
  window.addEventListener("online", () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; retryAttempt = 0; void flushPendingJobs(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function enqueue(job: Job): void {
  bindPagehideFlush();
  const key = jobKey(job.kind, job.clientId);
  pending.set(key, job);
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

export function enqueueUpsert(kind: CloudSyncKind, clientId: string): void {
  enqueue({ op: "upsert", kind, clientId, ownerId: getStorageOwner(), epoch: getOwnerEpoch() });
}

export function enqueueTombstone(kind: CloudSyncKind, clientId: string): void {
  enqueue({ op: "tombstone", kind, clientId, ownerId: getStorageOwner(), epoch: getOwnerEpoch() });
}

async function flushPendingJobs(): Promise<void> {
  if (drainScheduled || pending.size === 0) return chain;
  drainScheduled = true;
  chain = chain.catch(() => {}).then(async () => {
    // Pending stores only kind/id/owner. Each iteration loads at most one full payload;
    // updates during an in-flight upload replace the one pending job for that key.
    while (pending.size > 0) {
      const first = pending.entries().next().value as [string, Job] | undefined;
      if (!first) break;
      const [key, job] = first;
      if (!ownerStillCurrent(job.ownerId, job.epoch)) { pending.delete(key); continue; }
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const api = await resolveClient();
      if (!api) break;
      if (!ownerStillCurrent(job.ownerId, job.epoch)) { pending.delete(key); continue; }
      pending.delete(key);
      inFlightJob = job;
      persistLightJobs(job.ownerId);
      try {
        const committed = job.op === "tombstone"
          ? await pushTombstone(api, job.kind, job.clientId, job)
          : await pushOne(api, job.kind, job.clientId, job);
        if (!committed && ownerStillCurrent(job.ownerId, job.epoch)) {
          if (!pending.has(key)) pending.set(key, job);
          if (getCloudSyncStatus().message?.startsWith("云端同步失败")) queueRetry();
          break;
        }
        retryAttempt = 0;
      } catch (error) {
        if (ownerStillCurrent(job.ownerId, job.epoch) && !pending.has(key)) pending.set(key, job);
        reportError(`云端同步失败：${error instanceof Error ? error.message : "未知错误"}`);
        queueRetry();
        break;
      } finally {
        if (inFlightJob === job) inFlightJob = null;
        if (ownerStillCurrent(job.ownerId, job.epoch)) persistLightJobs(job.ownerId);
      }
    }
  }).finally(() => { drainScheduled = false; });
  await chain;
}

export async function flushCloudSyncForTests(): Promise<void> {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  await flushPendingJobs();
  await chain;
}

function withLocalApply(fn: () => void): void {
  beginCloudSyncApply();
  try {
    fn();
  } finally {
    endCloudSyncApply();
  }
}

function asChatPayload(value: unknown): ChatSessionSyncPayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ChatSessionSyncPayload;
  if (row.v !== 1 || !row.meta?.id || !Array.isArray(row.messages)) return null;
  return {
    v: 1,
    meta: row.meta,
    messages: compactStudyMessages(row.messages, "persist"),
  };
}

function asArtifact(value: unknown): Artifact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Artifact;
  if (typeof row.id !== "string" || typeof row.html !== "string") return null;
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : "",
    html: row.html,
    status: "done",
    reasoning: typeof row.reasoning === "string" ? row.reasoning : undefined,
  };
}

function asDocument(value: unknown): StoredDocument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredDocument;
  if (typeof row.id !== "string" || !row.spec) return null;
  return row;
}

function asUserNote(value: unknown): UserNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as UserNote;
  if (typeof row.id !== "string" || typeof row.markdown !== "string") return null;
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : "",
    markdown: row.markdown,
    subjectId: typeof row.subjectId === "string" ? row.subjectId : null,
    createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
    kind: row.kind === "classroom" ? "classroom" : row.kind === "personal" ? "personal" : undefined,
    quote: typeof row.quote === "string" ? row.quote : undefined,
    source: row.source,
  };
}

function asReviewCard(value: unknown): ReviewCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ReviewCard;
  if (typeof row.id !== "string" || typeof row.originalText !== "string") return null;
  return row;
}

/**
 * 闪卡的版本号。
 *
 * 闪卡本来没有 updatedAt（现网 94/94 只有 createdAt），所以过去无法判断先后，
 * 导致 pushOne 对 review-card 只能无条件覆盖云端。第三方改写方（Platform 的
 * Wiki）会补一个更新鲜的 updatedAt；没补时退回 createdAt，这样现网已有的卡
 * 无需迁移就能参与比较。
 */
function cardVersion(card: ReviewCard): number {
  const stamped = (card as { updatedAt?: unknown }).updatedAt;
  return typeof stamped === "number" && Number.isFinite(stamped) ? stamped : card.createdAt;
}

function asChatProject(value: unknown): ChatProjectSyncPayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ChatProjectSyncPayload;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const createdAt = typeof row.createdAt === "number" ? row.createdAt : Date.now();
  const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : createdAt;
  return {
    id: row.id,
    name: row.name,
    createdAt,
    updatedAt,
    ...(row.system === "note" || row.system === "floating" || row.system === "scheduled" ? { system: row.system } : {}),
  };
}

async function loadLocalPayload(kind: CloudSyncKind, clientId: string): Promise<unknown | null> {
  if (kind === "chat-session") {
    const session = await stores.loadSession(clientId);
    return session ? buildChatSessionPayload(session.meta, session.messages) : null;
  }
  if (kind === "artifact") {
    const artifact = await stores.getArtifact(clientId);
    return artifact ? buildArtifactPayload(artifact) : null;
  }
  if (kind === "document") {
    const doc = await stores.getDocument(clientId);
    return doc ? buildDocumentPayload(doc) : null;
  }
  if (kind === "user-note") {
    const note = stores.getNote(clientId);
    return note ? buildUserNotePayload(note) : null;
  }
  if (kind === "chat-project") {
    const project = stores.getProject(clientId);
    return project ? buildChatProjectPayload(project) : null;
  }
  const card = stores.getCard(clientId);
  return card ? buildReviewCardPayload(card) : null;
}

function rememberRemoteBytesFromRows(rows: SyncDocumentRow[]): void {
  const next = new Map<string, number>();
  for (const row of rows) {
    if (row.deleted) continue;
    next.set(jobKey(row.kind, row.client_id), payloadByteSize(row.payload));
  }
  remoteBytesByKey = next;
  remoteBytesReady = true;
  setCloudRowKeys(next.keys());
}

function noteRemoteBytes(kind: CloudSyncKind, clientId: string, bytes: number, deleted: boolean): void {
  const key = jobKey(kind, clientId);
  if (deleted) remoteBytesByKey.delete(key);
  else remoteBytesByKey.set(key, bytes);
  setCloudRowKeys(remoteBytesByKey.keys());
}

function cachedUserBytes(skipKind: CloudSyncKind, skipId: string): number | null {
  if (!remoteBytesReady) return null;
  let bytes = 0;
  const skip = jobKey(skipKind, skipId);
  for (const [key, value] of remoteBytesByKey) {
    if (key === skip) continue;
    bytes += value;
  }
  return bytes;
}

function cachedPoolBytes(pool: SyncQuotaPool, skipKind: CloudSyncKind, skipId: string): number {
  let bytes = 0;
  const skip = jobKey(skipKind, skipId);
  for (const [key, value] of remoteBytesByKey) {
    if (key === skip) continue;
    const kind = parseJobKey(key);
    if (!kind || quotaPoolForKind(kind) !== pool) continue;
    bytes += value;
  }
  return bytes;
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

async function remoteUserBytes(
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

function rememberBaseline(kind: CloudSyncKind, clientId: string, updatedAt: string | undefined): void {
  if (!updatedAt) return;
  baseline.set(jobKey(kind, clientId), updatedAt);
}

function reportError(message: string): void {
  setCloudSyncStatus({ phase: "error", message });
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
  const { data, error } = await api.upsert({
    kind,
    client_id: clientId,
    payload: {},
    deleted: true,
  });
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (error) {
    reportError(`云端同步失败：${error.message}`);
    return false;
  }
  rememberBaseline(kind, clientId, data?.updated_at);
  noteRemoteBytes(kind, clientId, 0, true);
  lastPushedHash.delete(jobKey(kind, clientId));
  lastOkBytes.delete(jobKey(kind, clientId));
  return true;
}

async function pushOne(api: SyncDocumentsApi, kind: CloudSyncKind, clientId: string, job?: Job): Promise<boolean> {
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  const local = await loadLocalPayload(kind, clientId);
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (!local) {
    return pushTombstone(api, kind, clientId, job);
  }

  const { data: remote, error: getError } = await api.get(kind, clientId);
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (getError) {
    reportError(`云端同步失败：${getError.message}`);
    return false;
  }

  let toUpload: unknown = local;
  if (kind === "user-note" && remote && !remote.deleted) {
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
  if (kind === "review-card" && remote && !remote.deleted) {
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
  if (kind === "chat-project" && remote && !remote.deleted) {
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
  if (kind === "chat-session" && remote && !remote.deleted) {
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
    if (prepared.reason === "kind-limit") {
      reportError(formatKindLimitMessage(kind, prepared.bytes, prepared.limit, lastOkBytes.get(jobKey(kind, clientId))));
    } else {
      reportError("同步内容含图片或密钥，已跳过上传。本机仍保留。");
    }
    return false;
  }

  const hash = await payloadFingerprint(prepared.payload);
  const remoteHash = remote && !remote.deleted ? await payloadFingerprint(remote.payload) : "";
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (hash && (lastPushedHash.get(jobKey(kind, clientId)) === hash || remoteHash === hash)) {
    rememberBaseline(kind, clientId, remote?.updated_at);
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
  });
  if (job && !ownerStillCurrent(job.ownerId, job.epoch)) return false;
  if (error) {
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
  rememberBaseline(kind, clientId, data?.updated_at);
  lastPushedHash.set(jobKey(kind, clientId), hash);
  lastOkBytes.set(jobKey(kind, clientId), prepared.bytes);
  noteRemoteBytes(kind, clientId, prepared.bytes, false);
  return true;
}

function capSessions(metas: SessionMeta[]): SessionMeta[] {
  if (metas.length <= MAX_LOCAL_SESSIONS) return metas;
  return [...metas].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL_SESSIONS);
}

async function applyChatPayloadToZustand(payload: ChatSessionSyncPayload): Promise<void> {
  // 先等本地水合：未水合时 sessionsMeta 是空的，据此写 manifest 会把盘上真实的会话列表
  // 覆盖成「只剩云端这一条」。等水合完再合并，顺带也保证拉取不会白跑。
  await ensureChatHistoryBootstrap().catch(() => {});
  const { meta, messages } = payload;
  const initial = useChatHistory.getState();
  if (!initial._hasHydrated) throw new Error("chat_history_not_hydrated");
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  await saveSessionMessagesCommitted(meta.id, messages);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  const state = useChatHistory.getState();
  const sessionsMeta = capSessions([meta, ...state.sessionsMeta.filter((item) => item.id !== meta.id)]);
  // The page checkpoint advances only after both content and its manifest are durable.
  await saveManifestCommitted(manifestFrom(state, { activeSessionId: state.activeSessionId ?? meta.id, sessions: sessionsMeta }));
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => applyCloudSessionWindow(meta, messages, sessionsMeta));
}

async function forgetLocalSessionInZustand(id: string): Promise<void> {
  // 同上：等水合完再按本地真实列表重写 manifest。
  await ensureChatHistoryBootstrap().catch(() => {});
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  const blobIds = await listBlobIdsForSession(id);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  await deleteSessionData(id, blobIds);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  const before = useChatHistory.getState();
  if (!before._hasHydrated) throw new Error("chat_history_not_hydrated");
  const retained = before.sessionsMeta.filter((item) => item.id !== id);
  const nextActive = before.activeSessionId === id ? retained[0]?.id ?? null : before.activeSessionId;
  await saveManifestCommitted(manifestFrom(before, { activeSessionId: nextActive, sessions: retained }));
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    const state = useChatHistory.getState();
    if (!state._hasHydrated) return;
    const sessionsMeta = state.sessionsMeta.filter((item) => item.id !== id);
    const messagesById = { ...state.messagesById };
    delete messagesById[id];
    const sessionWindowById = { ...state.sessionWindowById };
    delete sessionWindowById[id];
    const sessionLoadState = { ...state.sessionLoadState };
    delete sessionLoadState[id];
    const deletedActive = state.activeSessionId === id;
    const activeSessionId = deletedActive ? sessionsMeta[0]?.id ?? null : state.activeSessionId;
    useChatHistory.setState({
      sessionsMeta,
      messagesById,
      sessionWindowById,
      sessionLoadState,
      activeSessionId,
      loadedSessionIds: state.loadedSessionIds.filter((item) => item !== id),
    });
  });
}

async function applyArtifactToZustand(artifact: Artifact): Promise<void> {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  if (!await persistArtifactBody(artifact)) throw new Error("artifact_body_checkpoint_failed");
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    useArtifacts.setState((state) => ({
      byId: { ...state.byId, [artifact.id]: { ...artifact, bodyRef: true, html: "", summary: artifact.summary ?? htmlToSummary(artifact.html) } },
      order: state.order.includes(artifact.id) ? state.order : [...state.order, artifact.id],
    }));
  });
}

function forgetArtifactInZustand(id: string): void {
  withLocalApply(() => {
    useArtifacts.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId, order: state.order.filter((item) => item !== id) };
    });
  });
}

async function applyDocumentToZustand(doc: StoredDocument): Promise<void> {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  if (!await persistDocumentBody(doc)) throw new Error("document_body_checkpoint_failed");
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    useDocuments.setState((state) => ({
      byId: { ...state.byId, [doc.id]: { ...doc, bodyRef: true, sections: doc.sections.map((section) => ({ ...section, markdown: undefined })) } },
    }));
  });
}

function forgetDocumentInZustand(id: string): void {
  withLocalApply(() => {
    useDocuments.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId };
    });
  });
}

function applyNoteToZustand(note: UserNote): void {
  withLocalApply(() => {
    useUserNotes.setState((state) => ({
      byId: { ...state.byId, [note.id]: note },
      order: state.order.includes(note.id) ? state.order : [...state.order, note.id],
    }));
  });
}

function forgetNoteInZustand(id: string): void {
  withLocalApply(() => {
    useUserNotes.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      const noteAgentSessionById = { ...state.noteAgentSessionById };
      delete noteAgentSessionById[id];
      return {
        byId,
        order: state.order.filter((item) => item !== id),
        openEditorIds: state.openEditorIds.filter((item) => item !== id),
        noteAgentOpenIds: state.noteAgentOpenIds.filter((item) => item !== id),
        noteAgentSessionById,
        agentEditingNoteId: state.agentEditingNoteId === id ? null : state.agentEditingNoteId,
      };
    });
  });
}

function applyProjectToZustand(project: ChatProjectSyncPayload): void {
  withLocalApply(() => {
    useChatHistory.setState((state) => {
      const existing = state.folders.find((folder) => folder.id === project.id);
      const next: ChatFolder = {
        id: project.id,
        name: project.name,
        createdAt: existing?.createdAt ?? project.createdAt,
        updatedAt: project.updatedAt,
        ...(project.system ? { system: project.system } : {}),
      };
      const folders = existing
        ? state.folders.map((folder) => (folder.id === project.id ? next : folder))
        : [...state.folders, next];
      saveManifest(manifestFrom(state, { folders }));
      return { folders };
    });
  });
}

function forgetProjectInZustand(id: string): void {
  withLocalApply(() => {
    useChatHistory.setState((state) => {
      const target = state.folders.find((folder) => folder.id === id);
      // 系统项目不跟着云端 tombstone 消失：成员由 kind 决定，本地必须留着。
      if (!target || isSystemProject(target)) return state;
      const folders = state.folders.filter((folder) => folder.id !== id);
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.folderId === id ? { ...s, folderId: null } : s,
      );
      saveManifest(
        manifestFrom(state, {
          sessions: sessionsMeta,
          folders,
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }),
      );
      return {
        folders,
        sessionsMeta,
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      };
    });
  });
}

function applyCardToZustand(card: ReviewCard): void {
  withLocalApply(() => {
    useReviewCards.setState((state) => ({
      byId: { ...state.byId, [card.id]: card },
      order: state.order.includes(card.id) ? state.order : [...state.order, card.id],
    }));
  });
}

function forgetCardInZustand(id: string): void {
  withLocalApply(() => {
    useReviewCards.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId, order: state.order.filter((item) => item !== id) };
    });
  });
}

async function applyRemoteRow(row: SyncDocumentRow): Promise<void> {
  if (row.deleted) {
    if (row.kind === "chat-session") await stores.forgetSession(row.client_id);
    else if (row.kind === "artifact") stores.forgetArtifact(row.client_id);
    else if (row.kind === "document") stores.forgetDocument(row.client_id);
    else if (row.kind === "user-note") stores.forgetNote(row.client_id);
    else if (row.kind === "review-card") stores.forgetCard(row.client_id);
    else stores.forgetProject(row.client_id);
    return;
  }
  // 远端版本未前进（周期拉取里占绝大多数）：整行跳过，
  // 尤其对 chat-session 免去全量装配 + 合并 + v3 全量重写。
  const known = baseline.get(jobKey(row.kind, row.client_id));
  if (known && !isRemoteNewer(row.updated_at, known)) return;
  if (row.kind === "chat-session") {
    const remote = asChatPayload(row.payload);
    if (!remote) return;
    const local = await stores.loadSession(remote.meta.id);
    if (local) {
      const merged = mergeChatSessionPayloads(
        { v: 1, meta: local.meta, messages: local.messages },
        remote,
      );
      // 字节相等短路：合并结果与本地一致时跳过全量落盘 + 窗口/派生重算。
      if (JSON.stringify(merged.payload) !== JSON.stringify({ v: 1, meta: local.meta, messages: local.messages })) {
        await stores.applySession(merged.payload);
      }
      if (merged.added > 0) reportMerged();
    } else {
      await stores.applySession(remote);
    }
    return;
  }
  if (row.kind === "artifact") {
    const artifact = asArtifact(row.payload);
    if (artifact) await stores.applyArtifact(artifact);
    return;
  }
  if (row.kind === "document") {
    const doc = asDocument(row.payload);
    if (doc) await stores.applyDocument(doc);
    return;
  }
  if (row.kind === "user-note") {
    const note = asUserNote(row.payload);
    if (!note) return;
    const local = stores.getNote(row.client_id);
    if (local && local.updatedAt > note.updatedAt) return;
    stores.applyNote(note);
    return;
  }
  if (row.kind === "review-card") {
    const card = asReviewCard(row.payload);
    if (card) stores.applyCard(card);
    return;
  }
  const project = asChatProject(row.payload);
  if (!project) return;
  const localProject = stores.getProject(row.client_id);
  if (localProject && localProject.updatedAt > project.updatedAt) return;
  stores.applyProject(project);
}

async function pullFromCloud(api: SyncDocumentsApi, ownerId: string | null, epoch: number): Promise<boolean> {
  remoteBytesByKey = new Map();
  remoteBytesReady = false;
  let cursor: string | undefined;
  // listPage is bounded for the canonical client; legacy injected clients remain a single array adapter.
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    if (!ownerStillCurrent(ownerId, epoch)) return false;
    const page = api.listPage
      ? await api.listPage(CLOUD_SYNC_KINDS, cursor)
      : { ...(await api.list(CLOUD_SYNC_KINDS)), nextCursor: null };
    if (!ownerStillCurrent(ownerId, epoch)) return false;
    if (page.error) { reportError(`云端同步失败：${page.error.message}`); return false; }
    for (const row of page.data) {
      if (!row.deleted) remoteBytesByKey.set(jobKey(row.kind, row.client_id), payloadByteSize(row.payload));
    }
    for (const deleted of [true, false]) {
      for (const row of page.data) {
        if (row.deleted !== deleted) continue;
        if (!ownerStillCurrent(ownerId, epoch)) return false;
        try {
          await applyRemoteRow(row);
          if (!ownerStillCurrent(ownerId, epoch)) return false;
          rememberBaseline(row.kind, row.client_id, row.updated_at);
        } catch (error) {
          reportError(`云端第 ${pageNumber + 1} 页应用失败：${error instanceof Error ? error.message : "未知错误"}`);
          return false;
        }
      }
    }
    if (!page.nextCursor) {
      remoteBytesReady = true;
      setCloudRowKeys(remoteBytesByKey.keys());
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
  const push = (kind: CloudSyncKind, id: string) => pushOne(api, kind, id, { op: "upsert", kind, clientId: id, ownerId, epoch });
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
  ];
  let next = 0;
  while (next < jobs.length && ownerStillCurrent(ownerId, epoch)) {
    const batch: typeof jobs = [];
    let reservedBytes = 0;
    while (next < jobs.length && batch.length < PUSH_CONCURRENCY) {
      const job = jobs[next];
      const weight = KIND_SIZE_LIMIT[job.kind];
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
  if ([...pending.values()].some((job) => job.ownerId === ownerId && job.op === "tombstone")) return;
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
