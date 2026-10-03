import { DefaultChatTransport, isToolUIPart, readUIMessageStream, type FinishReason, type UIMessageChunk } from 'ai';
import type { RequestMessage } from '@/lib/chat/buildRequestMessages';
import { REQUEST_TOO_LARGE_MESSAGE } from '@/lib/chat/requestBudget';
import type { ChatMessage, ChatMessagePart, ContextBreakdown, UsageSummary } from '@/lib/types/chat';

/** SDK 负责 SSE/UTF-8 解码；只在原始字节层观察活动，注释心跳也能续期。 */
export function createStudyChatTransport(onActivity: () => void, agentMain = false) {
  return new DefaultChatTransport<RequestMessage>({
    api: agentMain ? '/api/agent/chat' : '/api/chat',
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        let parsedError = '';
        try {
          const parsed = JSON.parse(detail) as { error?: unknown };
          if (typeof parsed.error === 'string') parsedError = parsed.error.trim();
        } catch {
          parsedError = '';
        }
        if (response.status === 413) throw new Error(REQUEST_TOO_LARGE_MESSAGE);
        if (parsedError) throw new Error(parsedError);
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 200)}` : ''}`);
      }
      if (!response.body) throw new Error('流读取失败');
      onActivity();
      return new Response(response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          onActivity();
          controller.enqueue(chunk);
        },
      })), { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

const FINISH_REASONS: ReadonlySet<string> = new Set([
  'stop', 'length', 'content-filter', 'tool-calls', 'error', 'other',
]);

function readFinishReason(value: unknown): FinishReason | undefined {
  return typeof value === 'string' && FINISH_REASONS.has(value) ? value as FinishReason : undefined;
}

function readUsage(value: unknown): UsageSummary | undefined {
  const usage = objectValue(value);
  if (!usage) return undefined;
  const finiteToken = (key: string) => typeof usage[key] === 'number'
    && Number.isFinite(usage[key]) && usage[key] >= 0;
  if (!finiteToken('promptTokens') || !finiteToken('completionTokens')) return undefined;
  const promptTokens = usage.promptTokens as number;
  const completionTokens = usage.completionTokens as number;
  // 0/0 不是一次真实消耗；写进 metadata 会让客户端再记一条 ¥0 幽灵账单。
  if (promptTokens === 0 && completionTokens === 0) return undefined;
  return {
    promptTokens,
    completionTokens,
    cachedTokens: finiteToken('cachedTokens') ? usage.cachedTokens as number : 0,
    totalTokens: finiteToken('totalTokens') ? usage.totalTokens as number : promptTokens + completionTokens,
    ...(typeof usage.actualModelId === 'string' && usage.actualModelId ? { actualModelId: usage.actualModelId } : {}),
  };
}

function readBreakdown(value: unknown): ContextBreakdown | undefined {
  const data = objectValue(value);
  if (!data || !['tools', 'skills', 'conversation', 'pages', 'webSearch', 'total'].every(
    (key) => typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0,
  )) return undefined;
  return {
    tools: data.tools as number, skills: data.skills as number,
    conversation: data.conversation as number, pages: data.pages as number,
    webSearch: data.webSearch as number, total: data.total as number,
    ...(typeof data.truncated === 'boolean' ? { truncated: data.truncated } : {}),
    ...(typeof data.displayTotal === 'number' && Number.isFinite(data.displayTotal) && data.displayTotal >= 0
      ? { displayTotal: data.displayTotal } : {}),
    ...(typeof data.cachedTokens === 'number' && Number.isFinite(data.cachedTokens) && data.cachedTokens >= 0
      ? { cachedTokens: data.cachedTokens } : {}),
    ...(typeof data.cacheHit === 'boolean' ? { cacheHit: data.cacheHit } : {}),
    ...(typeof data.warning === 'string' ? { warning: data.warning } : {}),
  };
}

function traceTimingKeys(part: ChatMessagePart, partIndex: number): string[] {
  if (isToolUIPart(part)) return [`tool:${part.toolCallId}`];
  if (part.type === 'reasoning') return [`reasoning:${partIndex}`];
  // Legacy providers can stream <think> inside a text part. Recording both stable
  // projections lets buildTrace select the one it actually renders without guessing.
  if (part.type === 'text') return [`text:${partIndex}`, `reasoning:${partIndex}:think`];
  return [];
}

function traceTimingComplete(part: ChatMessagePart): boolean {
  if (part.type === 'reasoning' || part.type === 'text') return part.state !== 'streaming';
  if (!isToolUIPart(part)) return false;
  if (part.state === 'output-available') return !part.preliminary;
  if (part.state === 'output-error' || part.state === 'output-denied') return true;
  return part.state === 'approval-responded' && !part.approval.approved;
}

export interface ConsumeStudyStreamOptions {
  stream: ReadableStream<UIMessageChunk>;
  message: ChatMessage;
  abortSignal?: AbortSignal;
  onMessage: (message: ChatMessage) => void;
  onUsage?: (usage: UsageSummary) => void;
  onContextBreakdown?: (breakdown: ContextBreakdown) => void;
  onInfo?: (message: string) => void;
}

/**
 * SDK 还原有序 parts；此处只适配项目的 data/metadata 和生命周期，不维护第二份聊天历史。
 * readUIMessageStream 会在后台消费输入，取消它的输出不会关闭网络，因此显式管理输入 reader。
 */
export async function consumeStudyStream({
  stream, message, abortSignal, onMessage, onUsage, onContextBreakdown, onInfo,
}: ConsumeStudyStreamOptions): Promise<ChatMessage> {
  const source = stream.getReader();
  let inputController: ReadableStreamDefaultController<UIMessageChunk>;
  let stopped = false;
  let completed = false;
  let failure: unknown;
  let latest = structuredClone(message);
  let dataUsage: UsageSummary | undefined;
  let finishReason: FinishReason | undefined;
  let questions = message.followUpQuestions;
  const startedAt = Date.now();
  const stepStartedAt = new Map<string, number>();
  const completedStepTimings = new Set<string>();
  const stepDurationsMs: Record<string, number> = { ...(message.metadata?.stepDurationsMs ?? {}) };
  const observeStepDurations = (parts: readonly ChatMessagePart[], now: number, finalize = false) => {
    parts.forEach((part, partIndex) => {
      for (const key of traceTimingKeys(part, partIndex)) {
        if (completedStepTimings.has(key)) continue;
        const firstSeenAt = stepStartedAt.get(key) ?? now;
        if (!stepStartedAt.has(key)) stepStartedAt.set(key, firstSeenAt);
        stepDurationsMs[key] = Math.max(stepDurationsMs[key] ?? 0, now - firstSeenAt);
        if (finalize || traceTimingComplete(part)) completedStepTimings.add(key);
      }
    });
  };
  const stop = (reason: unknown) => {
    if (stopped) return;
    stopped = true;
    inputController.error(reason);
    void source.cancel(reason).catch(() => {});
  };
  const abort = () => stop(abortSignal?.reason ?? new DOMException('生成被中断', 'AbortError'));
  const input = new ReadableStream<UIMessageChunk>({
    start(controller) { inputController = controller; },
    async pull(controller) {
      try {
        const result = await source.read();
        if (stopped) return;
        if (result.done) {
          stopped = true;
          controller.close();
          return;
        }
        const chunk = result.value;
        if (chunk.type === 'abort') {
          stop(new DOMException('生成被中断', 'AbortError'));
          return;
        }
        if (chunk.type === 'finish') {
          completed = true;
          finishReason = readFinishReason(chunk.finishReason) ?? finishReason;
          finishReason = readFinishReason(objectValue(chunk.messageMetadata)?.finishReason) ?? finishReason;
        }
        if (chunk.type === 'message-metadata') {
          finishReason = readFinishReason(objectValue(chunk.messageMetadata)?.finishReason) ?? finishReason;
        }
        if (chunk.type === 'data-usage') dataUsage = readUsage(chunk.data) ?? dataUsage;
        if (chunk.type === 'data-context-breakdown') {
          const breakdown = readBreakdown(chunk.data);
          if (breakdown) onContextBreakdown?.(breakdown);
        }
        if (chunk.type === 'data-followup') {
          const candidates = objectValue(chunk.data)?.questions;
          if (Array.isArray(candidates)) {
            const next = candidates.filter((q): q is string => typeof q === 'string')
              .map((q) => q.trim()).filter(Boolean).slice(0, 3);
            if (next.length > 0) questions = next;
          }
        }
        if (chunk.type === 'data-info') {
          const info = objectValue(chunk.data)?.message;
          if (typeof info === 'string') onInfo?.(info);
        }
        controller.enqueue(chunk);
      } catch (error) { stop(error); }
    },
    cancel(reason) {
      stopped = true;
      void source.cancel(reason).catch(() => {});
    },
  }, { highWaterMark: 0 });
  abortSignal?.addEventListener('abort', abort, { once: true });
  if (abortSignal?.aborted) abort();

  try {
    for await (const snapshot of readUIMessageStream<ChatMessage>({
      // SDK 会原地更新传入的 message，不能把 Zustand 中的对象直接交给它。
      message: structuredClone(message), stream: input, terminateOnError: true,
      onError(error) { failure ??= error; stop(error); },
    })) {
      observeStepDurations(snapshot.parts, Date.now());
      latest = {
        ...snapshot,
        // 服务端 start 的 id 不得替换本地占位的主键。
        id: message.id, followUpQuestions: questions,
        metadata: {
          ...snapshot.metadata,
          ...(Object.keys(stepDurationsMs).length ? { stepDurationsMs: { ...stepDurationsMs } } : {}),
        },
      };
      onMessage(latest);
    }
    if (failure) throw failure;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    abortSignal?.removeEventListener('abort', abort);
    // cancel 不能阻塞错误/停止路径的最终 UI 落盘。
    void source.cancel(failure).catch(() => {});
    source.releaseLock();
    const usage = dataUsage ?? readUsage(latest.metadata?.usage);
    const wasAborted = abortSignal?.aborted === true || objectValue(failure)?.name === 'AbortError';
    const endedNormally = completed && failure == null && !wasAborted;
    finishReason = finishReason ?? readFinishReason(latest.metadata?.finishReason);
    observeStepDurations(latest.parts, Date.now(), true);
    latest = {
      ...latest, followUpQuestions: questions,
      metadata: {
        ...latest.metadata,
        ...(usage ? { usage } : {}),
        durationMs: latest.metadata?.durationMs ?? Date.now() - startedAt,
        ...(Object.keys(stepDurationsMs).length ? { stepDurationsMs: { ...stepDurationsMs } } : {}),
        ...(finishReason ? { finishReason } : {}),
      },
      parts: latest.parts.map((part) => {
        // SDK 的 state 描述 part 是否收到了结束帧，不等于 hook 当前是否仍在运行。
        // 停止/失败时保留 streaming；Trace 结合 isStreaming=false 显示「已停止」，
        // 历史消息也可辨认中断。部分正文照常可读，不能伪装成完整思考。
        if (part.type === 'text' || part.type === 'reasoning') {
          return endedNormally ? { ...part, state: 'done' as const } : part;
        }
        if (isToolUIPart(part) && (part.state === 'input-streaming' || part.state === 'input-available')) {
          if (wasAborted || (failure == null && !completed)) return part;
          return {
            ...part, state: 'output-error' as const,
            errorText: failure instanceof Error ? failure.message : '工具未返回结果',
          } as ChatMessagePart;
        }
        return part;
      }),
    };
    onMessage(latest);
    // data-usage 与 metadata 都携带用量；每个请求仅在终结时结算一次。
    if (usage) onUsage?.(usage);
  }
  return latest;
}
