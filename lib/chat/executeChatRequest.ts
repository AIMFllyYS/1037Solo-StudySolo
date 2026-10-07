import { consumeStudyStream, createStudyChatTransport } from "@/lib/chat/consumeStudyStream";
import { buildRequestMessages } from "@/lib/chat/buildRequestMessages";
import { checkpointMessages } from '@/lib/context/compactChatSession';
import { useChatHistory } from '@/lib/stores/chatHistory';
import { useCompactionState } from '@/lib/context/compactionState';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
import { collectCloudFileIds } from '@/lib/files/contract';
import { createStreamUiThrottle } from "@/lib/chat/streamUiThrottle";
import { flushPendingWrites } from "@/lib/storage/idbStorage";
import { notifyAccountUsageChanged } from "@/lib/billing/quotaView";
import { createStallWatchdog, type StallReason } from "@/lib/chat/createStallWatchdog";
import { hydrateForRequest, lastUserMessageId } from "@/lib/chat/hydrateForRequest";
import { resolveFollowUps } from "@/lib/chat/resolveFollowUps";
import { fitChatRequest } from "@/lib/chat/requestBudget";
import { slimSkillsForRequest } from "@/lib/chat/slimSkills";
import { scheduleCloudUpsert } from "@/lib/sync/schedule";
import { markSessionStreaming } from "@/lib/sync/streamingSessions";
import type { ChatRequestBody } from "@/lib/chat/buildChatRequestBody";
import type { ContextBudget } from "@/lib/chat/estimateContextBudget";
import type { ChatMessage, ContextBreakdown, UsageSummary } from "@/lib/types/chat";

export async function executeChatRequest(input: {
  latestMessages: ChatMessage[];
  abortSignal: AbortSignal;
  budget: ContextBudget;
  body: ChatRequestBody;
  sessionId: string;
  userMessageId: string;
  assistant: ChatMessage;
  userContent: string;
  onWrite: (message: ChatMessage) => void;
  onInfo: (message: string) => void;
  onContextBreakdown: (breakdown: ContextBreakdown) => void;
  onUsage: (usage: UsageSummary) => void;
  /** 看门狗判定超时（idle = 真没数据；max-wait = 总时长到顶）。 */
  onStall: (reason: StallReason) => void;
  /** 「最长等待时间」：客户端总时长闸。缺省走 DEFAULT_MAX_WAIT_MS。 */
  maxWaitMs?: number;
  /** 用户点过「重新带入本轮」的历史消息 id：这些消息的附件重新水合、重新随请求上行。 */
  reincludedMessageIds?: readonly string[];
}): Promise<void> {
  let latest = input.assistant;
  const ownerEpoch = getOwnerEpoch();
  const throttle = createStreamUiThrottle();
  const writeUi = () => input.onWrite(latest);
  let watchdog: ReturnType<typeof createStallWatchdog> | undefined;
  markSessionStreaming(input.sessionId, true);
  try {
    const checkpoint = useChatHistory.getState().sessionsMeta.find(meta => meta.id === input.sessionId)?.contextCheckpoint;
    const sourceMessages = checkpointMessages(input.latestMessages, checkpoint);
    const hydrateIds = lastUserMessageId(input.latestMessages);
    // 新附件用云端稳定引用；仅旧的本机附件需要从 IDB 水合字节。
    const hydrateMessageIds = new Set<string>(input.reincludedMessageIds ?? []);
    if (hydrateIds) hydrateMessageIds.add(hydrateIds);
    const hydrated = await hydrateForRequest(
      sourceMessages,
      input.abortSignal,
      hydrateMessageIds.size > 0 ? { messageIds: hydrateMessageIds } : undefined,
    );
    input.abortSignal.throwIfAborted();
    const { messages: built } = buildRequestMessages(hydrated, {
      maxTurns: Number.MAX_SAFE_INTEGER,
      preserveAttachmentHistory: false,
      reincludedMessageIds: new Set(input.reincludedMessageIds ?? []),
    });
    const body = {
      ...input.body,
      cloudFileIds: [...new Set([...(checkpoint?.cloudFileIds ?? []), ...collectCloudFileIds(input.latestMessages)])],
      skills: slimSkillsForRequest(input.body.skills, hydrated),
    };
    const fitted = fitChatRequest(built, body as unknown as Record<string, unknown>);
    if (fitted.info) input.onInfo(fitted.info);
    watchdog = createStallWatchdog(input.onStall, { maxWaitMs: input.maxWaitMs });
    const stream = await createStudyChatTransport(() => { watchdog?.touch(); }, input.body.agentMain === true).sendMessages({
      chatId: input.sessionId, trigger: "submit-message", messageId: input.userMessageId,
      messages: fitted.messages, abortSignal: input.abortSignal, body: fitted.body,
    });
    await consumeStudyStream({
      sessionId: input.sessionId,
      stream, message: input.assistant, abortSignal: input.abortSignal,
      onMessage(message) { latest = message; throttle.schedule(writeUi); },
      onInfo: input.onInfo,
      onContextBreakdown: input.onContextBreakdown,
      onUsage: input.onUsage,
    });
    const followUps = resolveFollowUps(latest, input.userContent);
    if (followUps) {
      latest = { ...latest, followUpQuestions: followUps };
      throttle.schedule(writeUi);
    }
  } finally {
    if (getOwnerEpoch() === ownerEpoch && useCompactionState.getState().byId[input.sessionId]?.phase === 'running') useCompactionState.getState().set(input.sessionId, 'error', '上下文整理被中断，原对话与附件仍保留。');
    throttle.flush();
    flushPendingWrites();
    markSessionStreaming(input.sessionId, false);
    scheduleCloudUpsert("chat-session", input.sessionId);
    watchdog?.stop();
    notifyAccountUsageChanged();
  }
}
