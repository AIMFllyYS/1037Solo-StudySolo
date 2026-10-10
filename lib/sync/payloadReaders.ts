import { compactStudyMessages } from "@/lib/chat/messages/compactStudyParts";
import { assetApi } from "@/lib/assets/client";
import type { Artifact } from "@/lib/stores/assets/artifacts";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import type { ChatProjectSyncPayload, ChatSessionSyncPayload, CloudSyncKind } from "./types";
import type { CloudSyncStores } from "./storeAdapterTypes";
import { buildArtifactPayload, buildChatProjectPayload, buildChatSessionPayload, buildDocumentPayload, buildReviewCardPayload, buildUserNotePayload } from "./payload";
export function asChatPayload(value: unknown): ChatSessionSyncPayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ChatSessionSyncPayload;
  if (row.v !== 1 || !row.meta?.id || !Array.isArray(row.messages)) return null;
  return {
    v: 1,
    meta: row.meta,
    messages: compactStudyMessages(row.messages, "persist"),
  };
}

export function asArtifact(value: unknown): Artifact | null {
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

export function asDocument(value: unknown): StoredDocument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredDocument;
  if (typeof row.id !== "string" || !row.spec) return null;
  return row;
}

export function asUserNote(value: unknown): UserNote | null {
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

export function asReviewCard(value: unknown): ReviewCard | null {
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
export function cardVersion(card: ReviewCard): number {
  const stamped = (card as { updatedAt?: unknown }).updatedAt;
  return typeof stamped === "number" && Number.isFinite(stamped) ? stamped : card.createdAt;
}

export function asChatProject(value: unknown): ChatProjectSyncPayload | null {
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

export async function loadLocalPayload(stores: CloudSyncStores, kind: CloudSyncKind, clientId: string): Promise<unknown | null> {
  if(kind==='image-gen'){
    const row=await stores.getImage?.(clientId);if(!row)return null;if(row.status!=='done')return row;const images=[];
    for(const image of row.images){if(image.b64_json)images.push({b64_json:image.b64_json,revised_prompt:image.revised_prompt});else if(image.url?.startsWith('data:image/'))images.push({b64_json:image.url.split(',')[1],revised_prompt:image.revised_prompt});else if(image.url){const captured=await assetApi('/capture-image',{method:'POST',body:JSON.stringify({url:image.url})});images.push({b64_json:captured.b64_json,revised_prompt:image.revised_prompt});}}
    return {...row,images,bodyRef:undefined};
  }
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
