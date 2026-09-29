import { tryGetBrowserAuthClient } from "@/lib/auth/browserClient";
import {
  deleteSessionData,
  isSystemProject,
  listBlobIdsForSession,
  loadSessionMessages,
  manifestFrom,
  saveManifest,
  saveSessionMessages,
  type ChatFolder,
  type SessionMeta,
} from "@/lib/storage/chatStorage";
import { useArtifacts, type Artifact } from "@/lib/stores/artifacts";
import { ensureChatHistoryBootstrap, useChatHistory } from "@/lib/stores/chatHistory";
import { useDocuments } from "@/lib/stores/documents";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import type { ChatMessage } from "@/lib/types/chat";
import { createSupabaseSyncClient } from "./client";
import { isRemoteNewer, mergeChatSessionPayloads } from "./merge";
import { compactStudyMessages } from "@/lib/chat/compactStudyParts";
import { tailWindowSlice } from "@/lib/chat/turnSpine";
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
type Job = { op: JobOp; kind: CloudSyncKind; clientId: string };

export interface CloudSyncStores {
  listSessionMetas: () => SessionMeta[];
  loadSession: (id: string) => Promise<{ meta: SessionMeta; messages: ChatMessage[] } | null>;
  applySession: (payload: ChatSessionSyncPayload) => void;
  forgetSession: (id: string) => void;
  listArtifactIds: () => string[];
  getArtifact: (id: string) => Artifact | null;
  applyArtifact: (artifact: Artifact) => void;
  forgetArtifact: (id: string) => void;
  listDocumentIds: () => string[];
  getDocument: (id: string) => StoredDocument | null;
  applyDocument: (doc: StoredDocument) => void;
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
    getArtifact: (id) => useArtifacts.getState().byId[id] ?? null,
    applyArtifact: applyArtifactToZustand,
    forgetArtifact: forgetArtifactInZustand,
    listDocumentIds: () => Object.keys(useDocuments.getState().byId),
    getDocument: (id) => useDocuments.getState().byId[id] ?? null,
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
let pagehideBound = false;

function jobKey(kind: CloudSyncKind, clientId: string): string {
  return `${kind}:${clientId}`;
}

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
  baseline.clear();
  lastOkBytes.clear();
  lastPushedHash.clear();
  remoteBytesByKey = new Map();
  remoteBytesReady = false;
  setCloudRowKeys(null);
  chain = Promise.resolve();
  unknownKindWarned.clear();
  __setSyncLimitsForTests(null);
  __resetStreamingSessionsForTests();
}

async function resolveClient(): Promise<SyncDocumentsApi | null> {
  if (injectedClient !== undefined) return injectedClient;
  const supabase = tryGetBrowserAuthClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user && "id" in data.session.user ? data.session.user.id : null;
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function enqueue(job: Job): void {
  bindPagehideFlush();
  const key = jobKey(job.kind, job.clientId);
  pending.set(key, job);
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
  enqueue({ op: "upsert", kind, clientId });
}

export function enqueueTombstone(kind: CloudSyncKind, clientId: string): void {
  enqueue({ op: "tombstone", kind, clientId });
}

async function flushPendingJobs(): Promise<void> {
  const jobs = [...pending.values()];
  pending.clear();
  if (jobs.length === 0) return;
  chain = chain.then(async () => {
    const api = await resolveClient();
    if (!api) return;
    for (const job of jobs) {
      if (job.op === "tombstone") await pushTombstone(api, job.kind, job.clientId);
      else await pushOne(api, job.kind, job.clientId);
    }
  });
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
    const artifact = stores.getArtifact(clientId);
    return artifact ? buildArtifactPayload(artifact) : null;
  }
  if (kind === "document") {
    const doc = stores.getDocument(clientId);
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

function payloadFingerprint(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

async function remoteUserBytes(
  api: SyncDocumentsApi,
  skipKind: CloudSyncKind,
  skipId: string,
): Promise<{ bytes: number; error: string | null }> {
  const cached = cachedUserBytes(skipKind, skipId);
  if (cached != null) return { bytes: cached, error: null };
  const { data, error } = await api.list(CLOUD_SYNC_KINDS);
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

async function pushTombstone(api: SyncDocumentsApi, kind: CloudSyncKind, clientId: string): Promise<void> {
  const { data, error } = await api.upsert({
    kind,
    client_id: clientId,
    payload: {},
    deleted: true,
  });
  if (error) {
    reportError(`云端同步失败：${error.message}`);
    return;
  }
  rememberBaseline(kind, clientId, data?.updated_at);
  noteRemoteBytes(kind, clientId, 0, true);
  lastPushedHash.delete(jobKey(kind, clientId));
  lastOkBytes.delete(jobKey(kind, clientId));
}

async function pushOne(api: SyncDocumentsApi, kind: CloudSyncKind, clientId: string): Promise<void> {
  const local = await loadLocalPayload(kind, clientId);
  if (!local) {
    await pushTombstone(api, kind, clientId);
    return;
  }

  const { data: remote, error: getError } = await api.get(kind, clientId);
  if (getError) {
    reportError(`云端同步失败：${getError.message}`);
    return;
  }

  let toUpload: unknown = local;
  if (kind === "user-note" && remote && !remote.deleted) {
    const localNote = asUserNote(local);
    const remoteNote = asUserNote(remote.payload);
    if (localNote && remoteNote && remoteNote.updatedAt > localNote.updatedAt) {
      stores.applyNote(remoteNote);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), payloadFingerprint(remote.payload));
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return;
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
      stores.applyCard(remoteCard);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), payloadFingerprint(remote.payload));
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return;
    }
  }
  if (kind === "chat-project" && remote && !remote.deleted) {
    const localProject = asChatProject(local);
    const remoteProject = asChatProject(remote.payload);
    // 项目没有正文可合并：谁的 updatedAt 新听谁的。
    if (localProject && remoteProject && remoteProject.updatedAt > localProject.updatedAt) {
      stores.applyProject(remoteProject);
      rememberBaseline(kind, clientId, remote.updated_at);
      lastPushedHash.set(jobKey(kind, clientId), payloadFingerprint(remote.payload));
      noteRemoteBytes(kind, clientId, payloadByteSize(remote.payload), false);
      return;
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
        stores.applySession(merged.payload);
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
    return;
  }

  const hash = payloadFingerprint(prepared.payload);
  const remoteHash = remote && !remote.deleted ? payloadFingerprint(remote.payload) : "";
  if (hash && (lastPushedHash.get(jobKey(kind, clientId)) === hash || remoteHash === hash)) {
    rememberBaseline(kind, clientId, remote?.updated_at);
    lastPushedHash.set(jobKey(kind, clientId), hash);
    lastOkBytes.set(jobKey(kind, clientId), prepared.bytes);
    noteRemoteBytes(kind, clientId, prepared.bytes, false);
    return;
  }

  const total = await remoteUserBytes(api, kind, clientId);
  if (total.error) {
    reportError(`云端同步失败：${total.error}`);
    return;
  }
  if (total.bytes + prepared.bytes > effectiveUserLimit()) {
    reportError(formatUserLimitMessage(effectiveUserLimit()));
    return;
  }
  const pool = quotaPoolForKind(kind);
  if (pool) {
    const poolBytes = cachedPoolBytes(pool, kind, clientId);
    if (poolBytes + prepared.bytes > effectivePoolLimit(pool)) {
      reportError(formatPoolLimitMessage(pool, effectivePoolLimit(pool)));
      return;
    }
  }

  const { data, error } = await api.upsert({
    kind,
    client_id: clientId,
    payload: prepared.payload,
    deleted: false,
  });
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
    return;
  }
  rememberBaseline(kind, clientId, data?.updated_at);
  lastPushedHash.set(jobKey(kind, clientId), hash);
  lastOkBytes.set(jobKey(kind, clientId), prepared.bytes);
  noteRemoteBytes(kind, clientId, prepared.bytes, false);
}

function capSessions(metas: SessionMeta[]): SessionMeta[] {
  if (metas.length <= MAX_LOCAL_SESSIONS) return metas;
  return [...metas].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL_SESSIONS);
}

async function applyChatPayloadToZustand(payload: ChatSessionSyncPayload): Promise<void> {
  // 先等本地水合：未水合时 sessionsMeta 是空的，据此写 manifest 会把盘上真实的会话列表
  // 覆盖成「只剩云端这一条」。等水合完再合并，顺带也保证拉取不会白跑。
  await ensureChatHistoryBootstrap().catch(() => {});
  withLocalApply(() => {
    const { meta, messages } = payload;
    const state = useChatHistory.getState();
    if (!state._hasHydrated) return;
    const sessionsMeta = capSessions([
      meta,
      ...state.sessionsMeta.filter((item) => item.id !== meta.id),
    ]);
    saveSessionMessages(meta.id, messages);
    // 走 manifestFrom 统一构造：手写字段漏掉 folders 会把用户的对话项目整批清空
    // （2026-09-20 核实：云端拉取一次就丢一次，会话的 folderId 全变悬空）。
    saveManifest(manifestFrom(state, { activeSessionId: state.activeSessionId ?? meta.id, sessions: sessionsMeta }));
    // 拉取只入尾部窗口 + 登记 loadedSessionIds：
    // 以前整段正文进 messagesById 且永不进 LRU，长会话 pull 一次就永久占内存。
    const sliced = tailWindowSlice(messages);
    const nextWindows = { ...state.sessionWindowById };
    nextWindows[meta.id] = {
      startTurn: sliced.startTurn,
      startIndex: sliced.startIndex,
      turnCount: sliced.spine.length,
      messageCount: messages.length,
      spine: sliced.spine,
    };
    useChatHistory.setState({
      sessionsMeta,
      messagesById: { ...state.messagesById, [meta.id]: sliced.messages },
      sessionWindowById: nextWindows,
      loadedSessionIds: [
        ...state.loadedSessionIds.filter((item) => item !== meta.id),
        meta.id,
      ],
    });
  });
}

async function forgetLocalSessionInZustand(id: string): Promise<void> {
  // 同上：等水合完再按本地真实列表重写 manifest。
  await ensureChatHistoryBootstrap().catch(() => {});
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
    saveManifest(manifestFrom(state, { activeSessionId, sessions: sessionsMeta }));
    useChatHistory.setState({
      sessionsMeta,
      messagesById,
      sessionWindowById,
      sessionLoadState,
      activeSessionId,
      loadedSessionIds: state.loadedSessionIds.filter((item) => item !== id),
    });
    void (async () => {
      const blobIds = await listBlobIdsForSession(id);
      await deleteSessionData(id, blobIds);
    })();
  });
}

function applyArtifactToZustand(artifact: Artifact): void {
  withLocalApply(() => {
    useArtifacts.setState((state) => ({
      byId: { ...state.byId, [artifact.id]: artifact },
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

function applyDocumentToZustand(doc: StoredDocument): void {
  withLocalApply(() => {
    useDocuments.setState((state) => ({
      byId: { ...state.byId, [doc.id]: doc },
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
    rememberBaseline(row.kind, row.client_id, row.updated_at);
    if (row.kind === "chat-session") stores.forgetSession(row.client_id);
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
  rememberBaseline(row.kind, row.client_id, row.updated_at);
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
        stores.applySession(merged.payload);
      }
      if (merged.added > 0) reportMerged();
    } else {
      stores.applySession(remote);
    }
    return;
  }
  if (row.kind === "artifact") {
    const artifact = asArtifact(row.payload);
    if (artifact) stores.applyArtifact(artifact);
    return;
  }
  if (row.kind === "document") {
    const doc = asDocument(row.payload);
    if (doc) stores.applyDocument(doc);
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

async function pullFromCloud(api: SyncDocumentsApi): Promise<void> {
  const { data, error } = await api.list(CLOUD_SYNC_KINDS);
  if (error) {
    reportError(`云端同步失败：${error.message}`);
    return;
  }
  rememberRemoteBytesFromRows(data);
  const tombstones = data.filter((row) => row.deleted);
  const live = data.filter((row) => !row.deleted);
  for (const row of tombstones) await applyRemoteRow(row);
  for (const row of live) await applyRemoteRow(row);
}

const PUSH_CONCURRENCY = 6;

async function pushAllLocal(api: SyncDocumentsApi): Promise<void> {
  // 每条 pushOne 内含一次 api.get：串行时 N 条 = N 个 RTT。并发池压到 ≤6。
  const jobs: Array<() => Promise<void>> = [
    ...stores.listSessionMetas()
      .filter((meta) => !isSessionStreaming(meta.id))
      .map((meta) => () => pushOne(api, "chat-session", meta.id)),
    ...stores.listArtifactIds().map((id) => () => pushOne(api, "artifact", id)),
    ...stores.listDocumentIds().map((id) => () => pushOne(api, "document", id)),
    ...stores.listNoteIds().map((id) => () => pushOne(api, "user-note", id)),
    ...stores.listCardIds().map((id) => () => pushOne(api, "review-card", id)),
    ...stores.listProjectIds().map((id) => () => pushOne(api, "chat-project", id)),
  ];
  let next = 0;
  const workers = Array.from({ length: Math.min(PUSH_CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await job();
    }
  });
  await Promise.all(workers);
}

export async function pullAndPushAll(): Promise<void> {
  const api = await resolveClient();
  if (!api) return;
  setCloudSyncStatus({ phase: "syncing", message: null });
  chain = chain.then(async () => {
    await pullFromCloud(api);
    await pushAllLocal(api);
    const current = getCloudSyncStatus();
    if (current.phase === "syncing") {
      setCloudSyncStatus({ phase: "idle", message: current.message });
    }
  });
  await chain;
}
