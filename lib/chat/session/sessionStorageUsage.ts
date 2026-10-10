import type { ChatMessage, StoredChatAttachment } from "@/lib/types/chat";
import { isAttachmentRef } from "@/lib/types/chat";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import { loadBlobDataUrl } from "@/lib/storage/chatStorage";
import { buildChatSessionPayload, payloadByteSize, utf8ByteLength } from "@/lib/sync/payload";
import { MAX_CHAT_SESSION_BYTES } from "@/lib/sync/types";

export interface SessionStorageUsage {
  conversationBytes: number;
  conversationLimitBytes: number;
  attachmentBytes: number;
  attachmentCount: number;
}

function fallbackMeta(id: string): SessionMeta {
  return {
    id,
    title: "",
    createdAt: 0,
    updatedAt: 0,
    messageCount: 0,
    artifactIds: [],
  };
}

export function attachmentStoredBytes(attachment: StoredChatAttachment): number {
  if (typeof attachment.size === "number" && attachment.size > 0) return attachment.size;
  if ("base64" in attachment && typeof attachment.base64 === "string") return utf8ByteLength(attachment.base64);
  if ("dataUrl" in attachment && typeof attachment.dataUrl === "string") return utf8ByteLength(attachment.dataUrl);
  if ("text" in attachment && typeof attachment.text === "string") return utf8ByteLength(attachment.text);
  return 0;
}

export async function resolveAttachmentBytes(
  attachment: StoredChatAttachment,
  loadBlob: (id: string) => Promise<string | null> = loadBlobDataUrl,
): Promise<number> {
  const known = attachmentStoredBytes(attachment);
  if (known > 0) return known;
  if (!isAttachmentRef(attachment)) return 0;
  const payload = await loadBlob(attachment.id);
  return payload ? utf8ByteLength(payload) : 0;
}

export function measureSessionStorageUsage(
  sessionId: string,
  messages: ChatMessage[],
  meta?: SessionMeta,
): SessionStorageUsage {
  const payload = buildChatSessionPayload(meta ?? fallbackMeta(sessionId), messages);
  let attachmentBytes = 0;
  let attachmentCount = 0;
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      attachmentCount += 1;
      attachmentBytes += attachmentStoredBytes(attachment);
    }
  }
  return {
    conversationBytes: payloadByteSize(payload),
    conversationLimitBytes: MAX_CHAT_SESSION_BYTES,
    attachmentBytes,
    attachmentCount,
  };
}

export async function measureSessionStorageUsageAsync(
  sessionId: string,
  messages: ChatMessage[],
  meta?: SessionMeta,
  loadBlob: (id: string) => Promise<string | null> = loadBlobDataUrl,
): Promise<SessionStorageUsage> {
  const usage = measureSessionStorageUsage(sessionId, messages, meta);
  let attachmentBytes = 0;
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      attachmentBytes += await resolveAttachmentBytes(attachment, loadBlob);
    }
  }
  return { ...usage, attachmentBytes };
}
