import type { ChatMessage } from "@/lib/types/chat";
import { getMessageText } from "@/lib/chat/messageParts";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { loadSessionMessages, flushPendingSessionCheckpoints } from "@/lib/storage/chatStorage";
import { useTokenTracker } from "@/lib/stores/chat/tokenTracker";
import { translateNow } from "@/lib/i18n";
import { getStorageOwner, getOwnerEpoch } from '@/lib/storage/ownerScope';
import { useCompactionState } from './compactionState';
import { useSettings } from '@/lib/stores/settings';
import { useSessionRuns } from '@/lib/stores/chat/sessionRuns';
import { flushPendingWrites } from '@/lib/storage/idbStorage';
import type { SessionMeta } from '@/lib/storage/chatStorage';
import { useFloatingTokenTracker } from '@/lib/stores/chat/floatingTokenTracker';
import { stripForbiddenFields } from '@/lib/sync/payload';
import { collectCloudFileIds } from '@/lib/files/contract';

/** 与服务端 compactHistory 对齐：保留最近 N 轮原文。 */
export const CHAT_COMPACT_KEEP_TURNS = 6;

export function splitChatKeptTurns(
  messages: ChatMessage[],
  keepTurns = CHAT_COMPACT_KEEP_TURNS,
): { old: ChatMessage[]; recent: ChatMessage[] } {
  const userIdx: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") userIdx.push(i);
  }
  if (userIdx.length <= keepTurns) return { old: [], recent: messages };
  const cut = userIdx[userIdx.length - keepTurns]!;
  return { old: messages.slice(0, cut), recent: messages.slice(cut) };
}

export function extractiveChatSummary(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role}: ${getMessageText(message)}`)
    .join("\n");
}

export function makeCompactSummaryMessages(summary: string, now = Date.now()): ChatMessage[] {
  return [
    {
      id: `compact-user-${now}`,
      role: "user",
      parts: [{ type: "text", text: `【对话摘要】此前讨论的压缩记录，回答开头提过的信息时请依据此摘要：\n${summary}` }],
      timestamp: now,
    },
    {
      id: `compact-assistant-${now}`,
      role: "assistant",
      parts: [{ type: "text", text: "已了解此前讨论，会结合摘要与最近对话继续。" }],
      timestamp: now + 1,
    },
  ];
}

export function compactChatMessages(
  messages: ChatMessage[],
  keepTurns = CHAT_COMPACT_KEEP_TURNS,
  aiSummary?: string,
): { messages: ChatMessage[]; compacted: boolean; summary?: string } {
  const { old, recent } = splitChatKeptTurns(messages, keepTurns);
  if (old.length === 0) return { messages, compacted: false };
  if (!aiSummary?.trim()) throw new Error('必须先调用 AI 整理上下文，原消息未修改。');
  const summary = aiSummary.trim();
  return {
    messages: [...makeCompactSummaryMessages(summary), ...recent],
    compacted: true,
    summary,
  };
}

export function checkpointMessages(messages: ChatMessage[], checkpoint?: SessionMeta['contextCheckpoint']): ChatMessage[] {
  if (!checkpoint) return messages;
  const covered = new Set(checkpoint.coveredIds);
  // A checkpoint is valid only when all covered source messages still exist.
  if (!checkpoint.coveredIds.every(id => messages.some(message => message.id === id))) return messages;
  if(checkpoint.coveredRevisions&&!checkpoint.coveredIds.every(id=>checkpoint.coveredRevisions![id]===(messages.find(message=>message.id===id)?.contentRevision??0)))return messages;
  return [...makeCompactSummaryMessages(checkpoint.summary, checkpoint.createdAt), ...messages.filter(message => !covered.has(message.id))];
}

export async function compactActiveSession(sessionId?: string | null, options?: { duringSend?: boolean; signal?: AbortSignal }): Promise<{ compacted: boolean }> {
  const store = useChatHistory.getState();
  const sid = sessionId ?? store.activeSessionId;
  if (!sid) return { compacted: false };
  if (useCompactionState.getState().byId[sid]?.phase === 'running') throw new Error('本会话正在压缩，请稍候。');
  if (!options?.duringSend && useSessionRuns.getState().byId[sid]?.phase === 'running') throw new Error('请先等待本轮回答结束，再压缩上下文。');
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const assertCurrent = () => { if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error('账号已切换，原对话未修改。'); };
  useCompactionState.getState().set(sid, 'running', '正在调用 AI 整理较早对话，原消息与附件会保留…');
  try {
  // compact 需要整段历史：窗口化后 messagesById 只是尾部窗口，直接全量装配读。
  await flushPendingSessionCheckpoints();
  const messages = (await loadSessionMessages(sid)) ?? [];
  assertCurrent();
  const meta = useChatHistory.getState().sessionsMeta.find(meta => meta.id === sid);
  const prepared = checkpointMessages(messages, meta?.contextCheckpoint);
  const { old } = splitChatKeptTurns(prepared);
  if (!old.length) { useCompactionState.getState().set(sid, 'done', '对话较短，暂不需要压缩。'); return { compacted: false }; }
  const settings = useSettings.getState();
  const payload = old.map(message => ({ role: message.role as 'user' | 'assistant', content: getMessageText(message) + '\n' + message.parts.filter(part => part.type.startsWith('tool-')).map(part => JSON.stringify(stripForbiddenFields(part))).join('\n') + '\n' + (message.attachments ?? []).map(a => `附件：${a.name ?? a.type}，cloudFileId=${a.cloudFileId ?? '仅本机旧附件'}`).join('\n') }));
  const timeout = AbortSignal.timeout(120000);
  const response = await fetch('/api/context/compact', { method: 'POST', credentials: 'include', signal: options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, messages: payload, modelId: settings.selectedModelId, customApiGroups: settings.customApiGroups }) });
  const result = await response.json();
  if (!response.ok || typeof result.summary !== 'string' || !result.summary.trim()) throw new Error(result.error || 'AI 压缩失败，原对话已保留。');
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return { compacted: false };
  const oldIds = new Set(old.map(message => message.id));
  const coveredIds = [...new Set([...(meta?.contextCheckpoint?.coveredIds ?? []), ...messages.filter(message => oldIds.has(message.id)).map(message => message.id)])];
  const cloudFileIds = [...new Set([...(meta?.contextCheckpoint?.cloudFileIds ?? []), ...collectCloudFileIds(messages)])];
  // No transcript replacement: only the next model request consumes this durable checkpoint.
  const latest = (await loadSessionMessages(sid)) ?? [];
  assertCurrent();
  const selected = messages.filter(message => coveredIds.includes(message.id));
  if (!selected.every(message => JSON.stringify(latest.find(item => item.id === message.id)) === JSON.stringify(message))) throw new Error('整理期间历史消息发生变化，原对话保留，请重新压缩。');
  useChatHistory.getState().setContextCheckpoint(sid, { summary: result.summary, coveredIds, coveredRevisions:Object.fromEntries(messages.filter(m=>coveredIds.includes(m.id)).map(m=>[m.id,m.contentRevision??0])), cloudFileIds, createdAt: Date.now() });
  flushPendingWrites();
  useCompactionState.getState().set(sid, 'done', '上下文已由 AI 整理，原消息与云端附件保留。');
  if (meta?.kind === 'floating' || meta?.kind === 'note') useFloatingTokenTracker.setState(state => ({ sessions: { ...state.sessions, [sid]: { ...useFloatingTokenTracker.getState().getSession(sid), contextWarning: translateNow('trace.panel.manualCompacted'), serverContextTokens: 0, contextBreakdown: null } } }));
  else useTokenTracker.setState({
    contextWarning: translateNow("trace.panel.manualCompacted"),
    serverContextTokens: 0,
    contextBreakdown: null,
  });
  return { compacted: true };
  } catch (error) {
    if (getStorageOwner() === owner && getOwnerEpoch() === epoch) useCompactionState.getState().set(sid, 'error', error instanceof Error ? error.message : '压缩失败，原对话已保留。');
    throw error;
  }
}
