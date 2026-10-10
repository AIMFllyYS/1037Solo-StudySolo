import type { ChatAttachment, ChatMessage, StoredChatAttachment } from "@/lib/types/chat";
import { idbStorage, setItemNow, chatBlobKey } from "@/lib/storage/idbStorage";
import { loadSessionMessages } from "./sessionStore";
function isBrowser(): boolean { return typeof window !== "undefined"; }
export async function loadBlobDataUrl(blobId: string): Promise<string | null> {
  if (!isBrowser()) return null;
  return idbStorage.getItem(chatBlobKey(blobId));
}

async function persistableDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("blob:")) return dataUrl;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取本地文件失败"));
    reader.readAsDataURL(blob);
  });
}

export async function saveBlobFromDataUrl(blobId: string, dataUrl: string): Promise<void> {
  if (!isBrowser()) return;
  const stored = await persistableDataUrl(dataUrl);
  const ok = await setItemNow(chatBlobKey(blobId), stored);
  if (!ok) throw new Error(`Failed to save chat blob: ${blobId}`);
}

function inlineAttachmentPayload(attachment: ChatAttachment): string | null {
  if (attachment.type === 'image') return attachment.base64 || null;
  if (attachment.type === 'document') return attachment.text;
  return attachment.dataUrl || null;
}

export function extractBlobIdsFromMessages(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (!m.attachments) continue;
    for (const a of m.attachments) {
      if ('id' in a && typeof (a as { id?: string }).id === 'string' && !('base64' in a)) {
        ids.push((a as { id: string }).id);
      }
    }
  }
  return ids;
}

export async function migrateAttachmentsInMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments = [];
    for (const a of m.attachments) {
      const payload = 'id' in a ? null : inlineAttachmentPayload(a);
      if (payload != null) {
        const id: string = `blob-${m.id}-${attachments.length}-${Date.now()}`;
        await saveBlobFromDataUrl(id, payload);
        attachments.push({
          id, type: a.type, mimeType: a.mimeType,
          cloudFileId: a.cloudFileId,
          name: a.name, size: a.size,
          ...('characterCount' in a ? { characterCount: a.characterCount } : {}),
        });
      } else {
        attachments.push(a);
      }
    }
    out.push({ ...m, attachments });
  }
  return out;
}

export async function hydrateAttachmentsForApi(
  messages: ChatMessage[],
  options?: { messageIds?: ReadonlySet<string> },
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (options?.messageIds && !options.messageIds.has(m.id)) {
      out.push(m);
      continue;
    }
    if (!m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments: ChatAttachment[] = [];
    for (const a of m.attachments) {
      if (a.cloudFileId) { attachments.push(a as ChatAttachment); continue; }
      if (!('id' in a)) {
        attachments.push(a as ChatAttachment);
      } else if ('id' in a) {
        const payload = await loadBlobDataUrl((a as { id: string }).id);
        if (payload) {
          attachments.push(a.type === 'document' ? {
            type: 'document',
            mimeType: a.mimeType as Extract<ChatAttachment, { type: 'document' }>['mimeType'],
            name: a.name ?? '未命名文档.txt',
            text: payload,
            size: a.size ?? new Blob([payload]).size,
            characterCount: a.characterCount ?? [...payload].length,
          } : a.type === 'local-file' ? {
            type: 'local-file', mimeType: a.mimeType as Extract<ChatAttachment, { type: 'local-file' }>['mimeType'], dataUrl: payload,
            name: a.name ?? '未命名本地文件', size: a.size ?? 0,
          } : {
            type: 'image', mimeType: a.mimeType, base64: payload,
            name: a.name, size: a.size,
          });
        }
      }
    }
    out.push({ ...m, attachments: attachments.length ? attachments : undefined });
  }
  return out;
}

export function persistInlineAttachments(message: ChatMessage): ChatMessage {
  if (!message.attachments?.length) return message;
  const attachments: StoredChatAttachment[] = [];
  for (const a of message.attachments) {
    if (!('id' in a)) {
      const payload = inlineAttachmentPayload(a);
      if (payload == null) {
        attachments.push(a);
        continue;
      }
      const id = `blob-${message.id}-${attachments.length}`;
      void saveBlobFromDataUrl(id, payload);
      attachments.push({
        id, type: a.type, mimeType: a.mimeType,
        cloudFileId: a.cloudFileId,
        name: a.name, size: a.size,
        ...('characterCount' in a ? { characterCount: a.characterCount } : {}),
      });
    } else {
      attachments.push(a);
    }
  }
  return { ...message, attachments };
}

export async function listBlobIdsForSession(sessionId: string): Promise<string[]> {
  const messages = await loadSessionMessages(sessionId);
  if (!messages) return [];
  return extractBlobIdsFromMessages(messages);
}
