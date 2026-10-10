// ChatMessage（UIMessage parts）的纯函数工具：取正文、判空、建消息、以及旧扁平结构的迁移。
// 客户端/服务端/测试通用，不依赖 React 与存储。

import { isToolUIPart, type ToolUIPart } from 'ai';
import type { ChatMessage, ChatMessagePart, StoredChatAttachment, StudyMessageMetadata } from '@/lib/types/chat';
import type { StudyTools } from '@/lib/ai/agent/toolTypes';
import { extractThinkBlocksFromContent, splitThinkContent, stripThinkTagsFromContent } from '@/lib/chat/rendering/parseChatContent';

export type ChatToolPart = ToolUIPart<StudyTools>;

export function isChatToolPart(part: ChatMessagePart): part is ChatToolPart {
  return isToolUIPart(part);
}


/** 所有 text part 拼接（供预览 / 标题 / 复制 / 导出）。 */
export function getMessageText(message: Pick<ChatMessage, 'parts'>): string {
  return message.parts
    .filter((p): p is Extract<ChatMessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n\n');
}

export function isMessageToolPart(part: ChatMessagePart): boolean {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function hasStepStart(parts: readonly ChatMessagePart[]): boolean {
  return parts.some((part) => part.type === 'step-start');
}

function lastToolPartIndex(parts: readonly ChatMessagePart[]): number {
  for (let index = parts.length - 1; index >= 0; index--) {
    if (isMessageToolPart(parts[index])) return index;
  }
  return -1;
}

function answerContentOf(text: string): string {
  return splitThinkContent(text).content;
}

function isAnswerTextPart(part: ChatMessagePart, index: number, parts: readonly ChatMessagePart[]): boolean {
  if (part.type !== 'text') return false;
  return hasStepStart(parts) || index > lastToolPartIndex(parts);
}

/** 面向用户的回答：有 step-start 时取全部正文（剥 think）；否则仍是最后工具之后的两桶回退。 */
export function getAnswerText(message: Pick<ChatMessage, 'parts'>): string {
  return message.parts
    .flatMap((part, index) => {
      if (!isAnswerTextPart(part, index, message.parts) || part.type !== 'text') return [];
      const content = answerContentOf(part.text);
      return content.trim() ? [content] : [];
    })
    .join('\n\n');
}

/**
 * 用新正文替换全部「答案」text part。时间线消息会丢掉分段、但保留工具/思考/step-start；
 * 无 step-start 的旧消息仍只替换最后工具之后的正文。
 */
export function withAnswerText(message: Pick<ChatMessage, 'parts'>, text: string): ChatMessagePart[] {
  const parts = message.parts;
  if (!hasStepStart(parts)) {
    const lastToolIndex = lastToolPartIndex(parts);
    const head = parts.slice(0, lastToolIndex + 1);
    const tail = parts.slice(lastToolIndex + 1).filter((part) => part.type !== 'text');
    return [...head, ...tail, { type: 'text', text, state: 'done' }];
  }

  let lastAnswer = -1;
  parts.forEach((part, index) => {
    if (isAnswerTextPart(part, index, parts)) lastAnswer = index;
  });
  if (lastAnswer < 0) return [...parts, { type: 'text', text, state: 'done' }];

  return parts.flatMap((part, index) => {
    if (!isAnswerTextPart(part, index, parts)) return [part];
    return index === lastAnswer ? [{ type: 'text' as const, text, state: 'done' as const }] : [];
  });
}

export function getReasoningText(message: Pick<ChatMessage, 'parts'>): string {
  return message.parts
    .filter((p): p is Extract<ChatMessagePart, { type: 'reasoning' }> => p.type === 'reasoning')
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n\n');
}

export function getToolParts(message: Pick<ChatMessage, 'parts'>): ChatToolPart[] {
  return message.parts.filter(isChatToolPart);
}

export function getToolPartsByName<N extends keyof StudyTools>(
  message: Pick<ChatMessage, 'parts'>,
  name: N,
): Array<Extract<ChatToolPart, { type: `tool-${N}` }>> {
  return message.parts.filter(
    (p): p is Extract<ChatToolPart, { type: `tool-${N}` }> => p.type === `tool-${name}`,
  );
}

/** 是否有任何可见内容（文本 / 思考 / 工具）。流式占位的空 assistant 消息返回 false。 */
export function hasVisibleContent(message: Pick<ChatMessage, 'parts'>): boolean {
  return message.parts.some((p) => {
    if (p.type === 'text' || p.type === 'reasoning') return p.text.trim().length > 0;
    if (p.type === 'file') return true;
    return isToolUIPart(p);
  });
}

export function createUserMessage(
  id: string,
  text: string,
  options: { attachments?: StoredChatAttachment[]; timestamp?: number } = {},
): ChatMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    timestamp: options.timestamp ?? Date.now(),
    attachments: options.attachments,
  };
}

export function createAssistantPlaceholder(
  id: string,
  metadata: StudyMessageMetadata,
  timestamp = Date.now(),
): ChatMessage {
  return { id, role: 'assistant', parts: [], metadata, timestamp };
}

// ─── 旧扁平结构迁移 ─────────────────────────────────────────────

interface LegacyToolCallBlock {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  argumentsStr?: string;
  status?: 'running' | 'success' | 'error';
  result?: string;
  sources?: unknown[];
  cacheHit?: boolean;
  provider?: string;
  artifactId?: string;
  title?: string;
  prompt?: string;
  artifactModelId?: string;
  artifactUnsupportedReason?: string;
  hits?: unknown[];
  skill?: string;
  imageGenId?: string;
  imageGenPrompt?: string;
  imageGenTitle?: string;
  imageGenSize?: string;
  imageGenCount?: number;
  imageModelId?: string;
}

export interface LegacyChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  reasoningContent?: string;
  toolCalls?: LegacyToolCallBlock[];
  followUpQuestions?: string[];
  attachments?: StoredChatAttachment[];
  metadata?: StudyMessageMetadata;
}

export function isLegacyMessage(value: unknown): value is LegacyChatMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.content === 'string' && !Array.isArray(v.parts);
}

function parseLegacyArgs(tc: LegacyToolCallBlock): Record<string, unknown> {
  if (tc.arguments && typeof tc.arguments === 'object') return tc.arguments;
  if (tc.argumentsStr) {
    try {
      return JSON.parse(tc.argumentsStr) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function legacyToolOutput(tc: LegacyToolCallBlock): Record<string, unknown> {
  const out: Record<string, unknown> = { text: tc.result ?? '' };
  if (tc.sources) {
    // 旧 imageSearch 直接落库 Unsplash 原始结果（url/thumbnail/author/source/alt），归一为 WebSearchSource。
    out.sources = tc.name === 'imageSearch'
      ? (tc.sources as Array<Record<string, unknown>>).map((s) =>
          'title' in s
            ? s
            : {
                title: String(s.alt ?? s.author ?? ''),
                url: String(s.url ?? ''),
                snippet: '',
                media: typeof s.thumbnail === 'string' ? s.thumbnail : undefined,
                alt: typeof s.alt === 'string' ? s.alt : undefined,
                author: typeof s.author === 'string' ? s.author : undefined,
                authorUrl: typeof s.source === 'string' ? s.source : undefined,
              },
        )
      : tc.sources;
  }
  if (tc.cacheHit != null) out.cacheHit = tc.cacheHit;
  if (tc.provider) out.provider = tc.provider;
  if (tc.hits) out.hits = tc.hits;
  if (tc.skill) {
    out.skill = tc.skill;
    out.found = true;
  }
  if (tc.name === 'renderInteractive' && tc.artifactId) {
    out.artifactId = tc.artifactId;
    out.title = tc.title ?? String(parseLegacyArgs(tc).title ?? '');
    out.prompt = tc.prompt ?? String(parseLegacyArgs(tc).prompt ?? '');
    if (tc.artifactModelId) out.modelId = tc.artifactModelId;
    if (tc.artifactUnsupportedReason) out.unsupportedReason = tc.artifactUnsupportedReason;
  }
  if (tc.name === 'generateImage' && tc.imageGenId) {
    out.imageGenId = tc.imageGenId;
    out.prompt = tc.imageGenPrompt ?? '';
    out.title = tc.imageGenTitle ?? '';
    out.size = tc.imageGenSize ?? '1024x1024';
    out.count = tc.imageGenCount ?? 1;
    if (tc.imageModelId) out.modelId = tc.imageModelId;
  }
  return out;
}

/**
 * 旧 { content, reasoningContent, toolCalls } → parts。
 * 旧结构没有时序信息，按「思考 → 工具 → 正文」的固定顺序重建；
 * 仍在 running 的工具（流中断时落库）按 output-error 标记。
 */
export function migrateLegacyMessage(legacy: LegacyChatMessage): ChatMessage {
  const parts: ChatMessagePart[] = [];
  const role: ChatMessage['role'] = legacy.role === 'tool' ? 'assistant' : legacy.role;

  const thinkBlocks = extractThinkBlocksFromContent(legacy.content);
  const reasoning = [legacy.reasoningContent?.trim(), ...thinkBlocks]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .join('\n\n');
  if (reasoning) parts.push({ type: 'reasoning', text: reasoning, state: 'done' });

  for (const tc of legacy.toolCalls ?? []) {
    const input = parseLegacyArgs(tc);
    if (tc.status === 'error' || tc.status === 'running') {
      parts.push({
        type: `tool-${tc.name}`,
        toolCallId: tc.id,
        state: 'output-error',
        input,
        errorText: tc.status === 'running' ? '生成被中断' : (tc.result ?? '运行失败'),
      } as unknown as ChatMessagePart);
    } else {
      parts.push({
        type: `tool-${tc.name}`,
        toolCallId: tc.id,
        state: 'output-available',
        input,
        output: legacyToolOutput(tc),
      } as unknown as ChatMessagePart);
    }
  }

  const text = stripThinkTagsFromContent(legacy.content, { streaming: false }).trim();
  if (text) {
    if (parts.length > 0) parts.push({ type: 'step-start' });
    parts.push({ type: 'text', text, state: 'done' });
  }

  return {
    id: legacy.id,
    role,
    parts,
    timestamp: legacy.timestamp,
    metadata: legacy.metadata,
    followUpQuestions: legacy.followUpQuestions,
    attachments: legacy.attachments,
  };
}

/** 读库时调用：新旧混合数组统一为 ChatMessage[]。 */
export function normalizeStoredMessages(raw: unknown[]): ChatMessage[] {
  return raw.map((m) => (isLegacyMessage(m) ? migrateLegacyMessage(m) : (m as ChatMessage)));
}
