import { utf8ByteLength } from '@/lib/sync/payload';
import type { RequestMessage } from '@/lib/chat/request/buildRequestMessages';

// Originals upload directly to private Storage; chat carries references and processed context.
export const MAX_CHAT_REQUEST_BYTES = 16 * 1024 * 1024;
export const MAX_REQUEST_IMAGE_CHARS = 12 * 1024 * 1024;
export const MAX_REQUEST_IMAGES = 9;
export const REQUEST_TOO_LARGE_MESSAGE = '这次上下文超过传输上限，原对话与附件已保留。请先压缩上下文后重试。';
export function requestPayloadBytes(messages: unknown, body: unknown): number {
  try {
    const extra = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    return utf8ByteLength(JSON.stringify({ ...extra, messages }));
  } catch { return Number.POSITIVE_INFINITY; }
}
export function fitChatRequest(messages: RequestMessage[], body: Record<string, unknown>, limit = MAX_CHAT_REQUEST_BYTES): { messages: RequestMessage[]; body: Record<string, unknown>; truncated: boolean; info?: string } {
  if (requestPayloadBytes(messages, body) > limit) throw new Error(REQUEST_TOO_LARGE_MESSAGE);
  return { messages, body, truncated: false };
}
export function isPayloadTooLargeError(err: unknown): boolean {
  if (err == null) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /\b413\b|request entity too large|entity too large|nginx/i.test(message);
}
