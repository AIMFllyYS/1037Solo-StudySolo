/** Upload limits apply to one composer submission, never to an entire conversation. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 9;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_BUCKET = 'ss-user-files';
export const CLOUD_FILE_PREFIX = 'studysolo-file://';
export const FILE_QUOTA_MESSAGE = '个人云端存储空间不足，请到「我的资产 → 云端文件」查看并清理文件后重试。删除前会再次确认。';

export interface ProcessedFile {
  v: 1;
  text?: string;
  image?: { dataUrl: string; mimeType: string };
  note?: string;
}
export interface CloudFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  project_id: string | null;
  state: 'pending' | 'ready' | 'deleted' | 'failed';
  created_at: string;
  deleted_at: string | null;
}

export function assertFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) throw new Error('每个附件（含照片）须大于 0 字节且不超过 25MB。');
}
export function fileReference(id: string): string { return `${CLOUD_FILE_PREFIX}${id}`; }
export function referencedFileId(value: unknown): string | null {
  if (typeof value !== 'string' || value.slice(0, CLOUD_FILE_PREFIX.length).toLowerCase() !== CLOUD_FILE_PREFIX) return null;
  const id = value.slice(CLOUD_FILE_PREFIX.length);
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}
export function referencedFileIdsInText(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/studysolo-file:\/\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi), match => referencedFileId(match[0])).filter((id): id is string => !!id))];
}
/** One reference collector for composer citations, messages, and durable AI checkpoints. */
export function collectCloudFileIds(messages: readonly { role?: string; parts: readonly { type: string; text?: unknown; url?: unknown }[]; attachments?: readonly { cloudFileId?: string }[] }[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) if (attachment.cloudFileId && referencedFileId(fileReference(attachment.cloudFileId))) ids.add(attachment.cloudFileId);
    for (const part of message.parts) {
      const id = part.type === 'file' ? referencedFileId(part.url) : null;
      if (id) ids.add(id);
      if (message.role === 'user' && part.type === 'text' && typeof part.text === 'string') for (const id of referencedFileIdsInText(part.text)) ids.add(id);
    }
  }
  return [...ids];
}
export function countComposerAttachments(attachments: readonly { cloudFileId?: string }[], notebookFiles: number, text: string): number {
  const uploadedIds = new Set(attachments.flatMap(attachment => attachment.cloudFileId ? [attachment.cloudFileId] : []));
  return attachments.length + notebookFiles + referencedFileIdsInText(text).filter(id => !uploadedIds.has(id)).length;
}
