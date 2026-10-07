import type { ChatMessage, StoredChatAttachment } from "@/lib/types/chat";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import { compactStudyMessages } from "@/lib/chat/compactStudyParts";
import {
  KIND_SIZE_LIMIT,
  KIND_QUOTA_POOL,
  MAX_USER_SYNC_BYTES,
  POOL_SIZE_LIMIT,
  type ArtifactSyncPayload,
  type ChatProjectSyncPayload,
  type ChatSessionSyncPayload,
  type CloudSyncKind,
  type DocumentSyncPayload,
  type ReviewCardSyncPayload,
  type SyncQuotaPool,
  type UserNoteSyncPayload,
} from "./types";

let kindLimitOverride: Partial<Record<CloudSyncKind, number>> | null = null;
let userLimitOverride: number | null = null;
let poolLimitOverride: Partial<Record<SyncQuotaPool, number>> | null = null;

export function __setSyncLimitsForTests(
  next: {
    kind?: Partial<Record<CloudSyncKind, number>>;
    user?: number;
    pool?: Partial<Record<SyncQuotaPool, number>>;
  } | null,
): void {
  kindLimitOverride = next?.kind ?? null;
  userLimitOverride = next?.user ?? null;
  poolLimitOverride = next?.pool ?? null;
}

export function effectiveKindLimit(kind: CloudSyncKind): number {
  return kindLimitOverride?.[kind] ?? KIND_SIZE_LIMIT[kind];
}

export function effectiveUserLimit(): number {
  return userLimitOverride ?? MAX_USER_SYNC_BYTES;
}

export function effectivePoolLimit(pool: SyncQuotaPool): number {
  return poolLimitOverride?.[pool] ?? POOL_SIZE_LIMIT[pool];
}

export function quotaPoolForKind(kind: CloudSyncKind): SyncQuotaPool | null {
  return KIND_QUOTA_POOL[kind] ?? null;
}

const MEDIA_DATA_URL_RE = /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi;
const STRIP_KEYS = new Set(["base64", "dataurl", "apikey", "api_key"]);

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function payloadByteSize(payload: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(payload));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function redactMediaString(value: string): string {
  return value.replace(MEDIA_DATA_URL_RE, "");
}

function stripNode(value: unknown): unknown {
  if (typeof value === "string") return redactMediaString(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripNode);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (STRIP_KEYS.has(key.toLowerCase())) continue;
    out[key] = stripNode(child);
  }
  return out;
}

export function stripForbiddenFields(value: unknown): unknown {
  return stripNode(value);
}

export function payloadLooksUnsafe(payload: unknown): boolean {
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    return true;
  }
  const lower = json.toLowerCase();
  if (lower.includes("data:image") || lower.includes("data:audio") || lower.includes("data:video")) {
    return true;
  }
  if (lower.includes('"base64"') || lower.includes('"apikey"') || lower.includes('"api_key"')) {
    return true;
  }
  return false;
}

function stripAttachment(a: StoredChatAttachment): StoredChatAttachment {
  const id = "id" in a && typeof a.id === "string" && a.id ? a.id : `unsynced-${a.mimeType}`;
  const name = "name" in a && typeof a.name === "string" ? a.name : undefined;
  const size = "size" in a && typeof a.size === "number" ? a.size : undefined;
  const characterCount = "characterCount" in a && typeof a.characterCount === "number" ? a.characterCount : undefined;
  return { id, type: a.type, mimeType: a.mimeType, name, size, characterCount, cloudFileId: a.cloudFileId };
}

export function sanitizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return compactStudyMessages(messages, "sync").map((message) => {
    const stripped = stripForbiddenFields(message) as ChatMessage;
    if (!message.attachments?.length) {
      return { ...stripped, attachments: undefined };
    }
    return {
      ...stripped,
      attachments: message.attachments.map(stripAttachment),
    };
  });
}

export function buildChatSessionPayload(meta: SessionMeta, messages: ChatMessage[]): ChatSessionSyncPayload {
  return {
    v: 1,
    meta,
    messages: sanitizeChatMessages(messages),
  };
}

export function buildArtifactPayload(artifact: ArtifactSyncPayload): ArtifactSyncPayload {
  return stripForbiddenFields({
    id: artifact.id,
    title: artifact.title,
    html: artifact.html,
    status: artifact.status,
    reasoning: artifact.reasoning,
  }) as ArtifactSyncPayload;
}

export function buildDocumentPayload(doc: DocumentSyncPayload): DocumentSyncPayload {
  return stripForbiddenFields({
    id: doc.id,
    spec: doc.spec,
    sections: doc.sections,
    status: doc.status,
    error: doc.error,
    modelId: doc.modelId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }) as DocumentSyncPayload;
}

export function buildUserNotePayload(note: UserNoteSyncPayload): UserNoteSyncPayload {
  return stripForbiddenFields({
    id: note.id,
    title: note.title,
    markdown: note.markdown,
    subjectId: note.subjectId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    kind: note.kind,
    quote: note.quote,
    source: note.source,
  }) as UserNoteSyncPayload;
}

export function buildReviewCardPayload(card: ReviewCardSyncPayload): ReviewCardSyncPayload {
  return stripForbiddenFields(card) as ReviewCardSyncPayload;
}

export function buildChatProjectPayload(project: ChatProjectSyncPayload): ChatProjectSyncPayload {
  return stripForbiddenFields({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...(project.system ? { system: project.system } : {}),
  }) as ChatProjectSyncPayload;
}

export type PayloadCheck =
  | { ok: true; payload: unknown; bytes: number }
  | { ok: false; reason: "unsafe" | "kind-limit"; bytes: number; limit: number };

export function preparePayload(
  kind: CloudSyncKind,
  raw: unknown,
): PayloadCheck {
  const payload = stripForbiddenFields(raw);
  const bytes = payloadByteSize(payload);
  const limit = effectiveKindLimit(kind);
  if (payloadLooksUnsafe(payload)) return { ok: false, reason: "unsafe", bytes, limit };
  if (bytes > limit) return { ok: false, reason: "kind-limit", bytes, limit };
  return { ok: true, payload, bytes };
}

function kb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

export function formatKindLimitMessage(
  kind: CloudSyncKind,
  bytes: number,
  limit: number,
  lastOkBytes?: number,
): string {
  const usedKb = kb(bytes);
  const limitKb = Math.round(limit / 1024);
  const last = lastOkBytes != null && lastOkBytes > 0 ? `上次成功约 ${kb(lastOkBytes)} KB，` : "";
  if (kind === "artifact") {
    return `这条演示 HTML 约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未上传云端。本机仍保留。`;
  }
  if (kind === "document") {
    return `这篇长文档约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未上传云端。本机仍保留。`;
  }
  if (kind === "user-note") {
    return `这篇笔记约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未上传云端。本机仍保留。`;
  }
  if (kind === "review-card") {
    return `这张闪卡约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未上传云端。本机仍保留。`;
  }
  if (kind === "chat-project") {
    return `这条项目名约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未同步到云端。本机仍保留。`;
  }
  return `这段对话约 ${usedKb} KB，${last}超过单条上限 ${limitKb} KB，未上传云端。本机仍保留。瘦身后可再试。`;
}

export function formatPoolLimitMessage(pool: SyncQuotaPool, limit: number): string {
  const mb = Math.round((limit / (1024 * 1024)) * 10) / 10;
  const label = pool === "notes" ? "笔记额度池" : "闪卡额度池";
  return `${label}已达 ${mb} MB 上限，本条未上传。本机仍保留。`;
}

export function formatUserLimitMessage(limit: number): string {
  const mb = Math.round((limit / (1024 * 1024)) * 10) / 10;
  return `云端同步已达 ${mb} MB 账号合计上限，本条未上传。本机仍保留。图片不会占用云端额度。`;
}

export function isSyncKindLimitError(message: string): boolean {
  return /sync_kind_limit/i.test(message);
}

export function isSyncUserLimitError(message: string): boolean {
  return /sync_user_limit/i.test(message);
}

export function isSyncPoolLimitError(message: string): boolean {
  return /sync_pool_limit/i.test(message);
}

/**
 * 云端还不认识这个 kind（迁移 0007 未执行）：数据库 check 约束会拒收。
 * 识别出来是为了**降级**——项目名只留本机、提示一次，而不是每改一次名弹一次错误。
 */
export function isSyncUnknownKindError(message: string): boolean {
  return /sync_documents_kind_check|check constraint|invalid input value for enum/i.test(message);
}
