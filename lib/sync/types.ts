import type { SessionMeta } from "@/lib/storage/chatStorage";
import type { ChatMessage } from "@/lib/types/chat";
import type { Artifact } from "@/lib/stores/artifacts";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";

/** 本 loop 实际上行的 kind。settings / skill 留到以后，且永远不带 apiKey。 */
export const CLOUD_SYNC_KINDS = ["chat-session", "artifact", "document", "user-note", "review-card", "chat-project"] as const;
export type CloudSyncKind = (typeof CLOUD_SYNC_KINDS)[number];

export const SCHEMA_SYNC_KINDS = ["chat-session", "artifact", "settings", "skill", "document", "user-note", "review-card", "chat-project"] as const;

export const SYNC_TABLE = "ss_sync_documents";

export type SyncQuotaPool = "notes" | "flashcards";

/**
 * 压缩之后的可用容量。个人向：各板块略抬一点，笔记/闪卡单独给高额度池。
 */
export const MAX_ARTIFACT_BYTES = Math.round(1.5 * 1024 * 1024);
export const MAX_DOCUMENT_BYTES = Math.round(2.5 * 1024 * 1024);
export const MAX_CHAT_SESSION_BYTES = 5 * 1024 * 1024;
export const MAX_USER_NOTE_BYTES = 2 * 1024 * 1024;
export const MAX_REVIEW_CARD_BYTES = 256 * 1024;
/** 项目只是一行名字 + 时间戳；32 KB 足够，也避免有人往里塞别的东西。 */
export const MAX_CHAT_PROJECT_BYTES = 32 * 1024;
export const MAX_NOTES_POOL_BYTES = Number.MAX_SAFE_INTEGER;
export const MAX_FLASHCARDS_POOL_BYTES = Number.MAX_SAFE_INTEGER;
export const MAX_USER_SYNC_BYTES = Number.MAX_SAFE_INTEGER;

export const KIND_SIZE_LIMIT: Record<CloudSyncKind, number> = {
  "chat-session": MAX_CHAT_SESSION_BYTES,
  artifact: MAX_ARTIFACT_BYTES,
  document: MAX_DOCUMENT_BYTES,
  "user-note": MAX_USER_NOTE_BYTES,
  "review-card": MAX_REVIEW_CARD_BYTES,
  "chat-project": MAX_CHAT_PROJECT_BYTES,
};

export const KIND_QUOTA_POOL: Partial<Record<CloudSyncKind, SyncQuotaPool>> = {
  "user-note": "notes",
  "review-card": "flashcards",
};

export const POOL_SIZE_LIMIT: Record<SyncQuotaPool, number> = {
  notes: MAX_NOTES_POOL_BYTES,
  flashcards: MAX_FLASHCARDS_POOL_BYTES,
};

export interface ChatSessionSyncPayload {
  v: 1;
  meta: SessionMeta;
  messages: ChatMessage[];
}

export type ArtifactSyncPayload = Pick<Artifact, "id" | "title" | "html" | "status" | "reasoning">;
export type DocumentSyncPayload = StoredDocument;
export type UserNoteSyncPayload = UserNote;
export type ReviewCardSyncPayload = ReviewCard;

/** 对话项目（会话分组的名字）：跨设备可见的最小负载，不含成员列表。 */
export interface ChatProjectSyncPayload {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  system?: "note" | "floating" | "scheduled";
}

export interface SyncDocumentRow {
  kind: CloudSyncKind;
  client_id: string;
  payload: unknown;
  deleted: boolean;
  updated_at: string;
}

export interface SyncDocumentsApi {
  list: (kinds: readonly CloudSyncKind[]) => Promise<{
    data: SyncDocumentRow[];
    error: { message: string } | null;
  }>;
  get: (
    kind: CloudSyncKind,
    clientId: string,
  ) => Promise<{ data: SyncDocumentRow | null; error: { message: string } | null }>;
  upsert: (row: {
    kind: CloudSyncKind;
    client_id: string;
    payload: unknown;
    deleted: boolean;
  }) => Promise<{ data: SyncDocumentRow | null; error: { message: string } | null }>;
}

export function isCloudSyncKind(value: string): value is CloudSyncKind {
  return (CLOUD_SYNC_KINDS as readonly string[]).includes(value);
}
