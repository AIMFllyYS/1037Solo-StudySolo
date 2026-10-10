import { isToolUIPart } from 'ai';
import type { ChatAttachment, ChatMessage, ChatMessagePart, StoredChatAttachment } from '@/lib/types/chat';
import { compactStudyParts } from '@/lib/chat/messages/compactStudyParts';
import { MAX_REQUEST_IMAGE_CHARS, MAX_REQUEST_IMAGES } from '@/lib/chat/request/requestBudget';
import { hasVisibleContent } from '@/lib/chat/messages/messageParts';
import { fileReference } from '@/lib/files/contract';

export const DEFAULT_MAX_TURNS = Number.MAX_SAFE_INTEGER;
/** 与 chatRequestSchema messages 上限对齐，防止 400。 */
export const MAX_REQUEST_MESSAGES = 200;

/** 发给 /api/chat 的消息：UIMessage 形状，本轮图片附件已转成 file part（data URL）。 */
export type RequestMessage = Pick<ChatMessage, 'id' | 'role' | 'parts'>;

export interface BuildRequestMessagesResult {
  messages: RequestMessage[];
  truncated: boolean;
  truncationReason?: 'max-turns' | 'soft-limit';
}

export interface BuildRequestMessagesOptions {
  maxTurns?: number;
  reason?: BuildRequestMessagesResult['truncationReason'];
  /** 仅控制旧的本机附件；新云端附件始终保留稳定引用，每条用户消息最多 9 个。 */
  preserveAttachmentHistory?: boolean;
  /**
   * 用户点过「重新带入本轮」的历史消息 id：这些消息的附件（含图片）重新随本次请求上行。
   * 字节一直都在本机 IndexedDB 里，这里只是把「带不带」的开关重新打开一轮。
   */
  reincludedMessageIds?: ReadonlySet<string>;
}

function keepRequestPart(p: ChatMessagePart): boolean {
  if (p.type === 'text') return p.text.trim().length > 0;
  if (p.type === 'file') return true;
  if (isToolUIPart(p)) return p.state === 'output-available' || p.state === 'input-available';
  return false;
}

function attachmentLabel(attachment: StoredChatAttachment): string {
  return ('name' in attachment && attachment.name?.trim()) || (attachment.type === 'image' ? '图片' : '文件');
}

/** 附件在本机 IndexedDB 里的稳定 id；只有存成 blob 引用的附件才有。 */
function attachmentId(attachment: StoredChatAttachment): string | null {
  const id = (attachment as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * 历史附件在请求里的占位说明。
 *
 * 仅用于旧的本机附件：原字节仍保留，可显式重新带入。云端附件走稳定引用与按需读取。
 * 以前这里只写「字节在本机」，模型只能回一句"我看不到图片"——用户无从下手。带上稳定 id 和
 * 明确的恢复动作后，模型可以直接告诉用户去点哪里的「重新带入本轮」。
 */
export function historyAttachmentNote(attachments: StoredChatAttachment[] | undefined): string | null {
  const notes = (attachments ?? []).flatMap((attachment) => {
    const id = attachmentId(attachment);
    const idText = id ? `（附件 ${id}）` : '';
    if (attachment.type === 'image') {
      return [
        `用户曾在更早的消息里附过图片「${attachmentLabel(attachment)}」${idText}，图片字节仍保存在本机，但**本轮没有随请求带上**。` +
        '需要它时，请让用户在那条消息的附件上点「重新带入本轮」，再重新提问。',
      ];
    }
    if (attachment.type === 'document') {
      return [`用户曾在更早的消息里附过文档「${attachmentLabel(attachment)}」${idText}，正文仍保存在本机，但本轮没有随请求带上。`];
    }
    return [];
  });
  return notes.length > 0 ? notes.join(' ') : null;
}

interface ImageFilePartsResult {
  parts: ChatMessagePart[];
  /** 因为数量 / 体积上限没能带上的图片名（要写进请求，否则模型以为用户没发图）。 */
  skipped: string[];
}

function imageFileParts(attachments: StoredChatAttachment[] | undefined): ImageFilePartsResult {
  const images = (attachments ?? []).filter(
    (a): a is Extract<ChatAttachment, { type: 'image' }> => a.type === 'image' && 'base64' in a && !!a.base64,
  );
  const parts: ChatMessagePart[] = [];
  const skipped: string[] = [];
  let chars = 0;
  for (const image of images) {
    if (parts.length >= MAX_REQUEST_IMAGES) {
      skipped.push(attachmentLabel(image));
      continue;
    }
    const url = image.base64;
    if (chars + url.length > MAX_REQUEST_IMAGE_CHARS) {
      skipped.push(attachmentLabel(image));
      continue;
    }
    parts.push({ type: 'file', mediaType: image.mimeType, url });
    chars += url.length;
  }
  return { parts, skipped };
}

/**
 * 图片带不上时给模型一句实话。
 * 以前这里是静默 continue：模型收到的消息里根本没有图，也没有任何说明，只能按纯文字回答，
 * 用户看到的就是"Agent 没看我的图"。这里把上限与下一步一起说清楚，模型才可能给出可执行回复。
 */
function skippedImageNote(skipped: string[]): ChatMessagePart | null {
  if (skipped.length === 0) return null;
  const limitKb = Math.round(MAX_REQUEST_IMAGE_CHARS / 1024);
  return {
    type: 'text',
    text: '（本轮有 ' + skipped.length + ' 张图片没能随请求发送：「' + skipped.join('」「') + '」。'
      + '单次最多带 ' + MAX_REQUEST_IMAGES + ' 张、合计不超过 ' + limitKb + 'KB。'
      + '请告诉用户压缩后再发，或改用文件形式；不要凭文件名猜测图片内容。）',
  };
}

function documentTextPart(attachments: StoredChatAttachment[] | undefined): ChatMessagePart | null {
  const documents = (attachments ?? [])
    .filter((a): a is Extract<ChatAttachment, { type: 'document' }> => a.type === 'document' && 'text' in a)
    .map((attachment) => {
      const safeName = attachment.name.replace(/[<>\r\n]/g, '_');
      return `<attached-document name="${safeName}" type="${attachment.mimeType}">\n${attachment.text}\n</attached-document>`;
    });
  if (documents.length === 0) return null;
  return { type: 'text', text: `以下是用户随本轮消息提供的文档正文：\n\n${documents.join('\n\n')}` };
}

export function toRequestMessage(
  m: ChatMessage,
  options?: { includeAttachments?: boolean; includeImages?: boolean },
): RequestMessage {
  const parts: ChatMessagePart[] = compactStudyParts(m.parts.filter(keepRequestPart), 'ui-request');
  if (m.role === 'user') {
    const cloud = (m.attachments ?? []).filter(a => a.cloudFileId);
    for (const attachment of cloud) parts.push({ type: 'file', mediaType: attachment.mimeType, url: fileReference(attachment.cloudFileId!), filename: attachment.name });
    if (cloud.length) m = { ...m, attachments: m.attachments?.filter(a => !a.cloudFileId) };
    if (options?.includeAttachments) {
      // includeImages 由调用方按"整包最多几张图"决定；缺省仍按老行为带图。
      if (options.includeImages !== false) {
        const images = imageFileParts(m.attachments);
        parts.push(...images.parts);
        const note = skippedImageNote(images.skipped);
        if (note) parts.push(note);
      }
      const document = documentTextPart(m.attachments);
      if (document) parts.push(document);
    } else {
      const note = historyAttachmentNote(m.attachments);
      if (note) parts.push({ type: 'text', text: note });
    }
  }
  return { id: m.id, role: m.role, parts };
}

/**
 * 从会话尾部取最近 N 条 user/assistant 消息用于 API 请求。
 * 缺省保留完整历史与所有云附件引用；执行路径先 AI 压缩，不用 maxTurns 静默删掉历史。
 */
export function buildRequestMessages(
  sessionMessages: ChatMessage[],
  maxTurnsOrOptions: number | BuildRequestMessagesOptions = DEFAULT_MAX_TURNS,
): BuildRequestMessagesResult {
  const opts: BuildRequestMessagesOptions =
    typeof maxTurnsOrOptions === 'number' ? { maxTurns: maxTurnsOrOptions } : maxTurnsOrOptions;
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const preserveAttachmentHistory = opts.preserveAttachmentHistory === true;
  const reincluded = opts.reincludedMessageIds ?? new Set<string>();
  const eligible = sessionMessages.filter((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    if (m.role === 'assistant' && !hasVisibleContent(m)) return false;
    return true;
  });
  const lastUserId = [...eligible].reverse().find((m) => m.role === 'user')?.id;
  const wantsAttachments = (m: ChatMessage) =>
    preserveAttachmentHistory || m.id === lastUserId || reincluded.has(m.id);
  // 图片限制按每条用户消息计算；不同轮次可再次上传，云引用不受会话累计数量限制。
  const imageMessages = new Set<string>();
  for (const m of [...eligible].reverse()) {
    if (m.role !== 'user' || !wantsAttachments(m)) continue;
    if ((m.attachments ?? []).some((attachment) => attachment.type === 'image')) imageMessages.add(m.id);
  }
  const toRequest = (m: ChatMessage) => toRequestMessage(m, {
    includeAttachments: wantsAttachments(m),
    includeImages: imageMessages.has(m.id),
  });
  if (eligible.length <= maxTurns) {
    return { messages: eligible.map(toRequest), truncated: false };
  }

  // 截断时仍然要保住附件：全量历史模式保所有带附件的 user 消息；
  // 否则至少保住用户显式点过「重新带入本轮」的那几条（它们可能落在窗口之外）。
  const withAttachments = eligible.filter((m) =>
    m.role === 'user' && (m.attachments?.length ?? 0) > 0
    && (preserveAttachmentHistory || reincluded.has(m.id)));
  const tail = eligible.slice(-maxTurns);
  const merged = new Map<string, ChatMessage>();
  for (const m of withAttachments) merged.set(m.id, m);
  for (const m of tail) merged.set(m.id, m);
  const ordered = eligible.filter((m) => merged.has(m.id));

  return {
    messages: ordered.map(toRequest),
    truncated: ordered.length < eligible.length,
    truncationReason: opts.reason ?? 'max-turns',
  };
}
