import type { ChatMessage } from "@/lib/types/chat";
import { getMessageText } from "@/lib/chat/messageParts";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { loadSessionMessages } from "@/lib/storage/chatStorage";
import { useTokenTracker } from "@/lib/stores/tokenTracker";
import { translateNow } from "@/lib/i18n";

/** 与服务端 compactHistory 对齐：保留最近 N 轮原文。 */
export const CHAT_COMPACT_KEEP_TURNS = 6;
const MAX_SUMMARY_CHARS = 800;

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
    .join("\n")
    .slice(0, MAX_SUMMARY_CHARS);
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
): { messages: ChatMessage[]; compacted: boolean; summary?: string } {
  const { old, recent } = splitChatKeptTurns(messages, keepTurns);
  if (old.length === 0) return { messages, compacted: false };
  const summary = extractiveChatSummary(old);
  return {
    messages: [...makeCompactSummaryMessages(summary), ...recent],
    compacted: true,
    summary,
  };
}

export async function compactActiveSession(sessionId?: string | null): Promise<{ compacted: boolean }> {
  const store = useChatHistory.getState();
  const sid = sessionId ?? store.activeSessionId;
  if (!sid) return { compacted: false };
  // compact 需要整段历史：窗口化后 messagesById 只是尾部窗口，直接全量装配读。
  const messages = (await loadSessionMessages(sid)) ?? [];
  const result = compactChatMessages(messages);
  if (!result.compacted) return { compacted: false };
  useChatHistory.getState().replaceMessages(sid, result.messages, messages);
  useTokenTracker.setState({
    contextWarning: translateNow("trace.panel.manualCompacted"),
  });
  return { compacted: true };
}
