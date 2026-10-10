import { useMemo } from "react";
import { collectSessionProducts, type AgentProductItem } from "@/lib/chat/sessionProducts";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import type { ChatMessage } from "@/lib/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PRODUCTS: AgentProductItem[] = [];

/**
 * 当前对话产出的出题 / 演示 / 文档。
 * 和 useSessionSourceRounds 一样按消息数组引用记忆，避免来源卡每帧重算。
 */
export function useSessionProducts(sessionId?: string, enabled = true): AgentProductItem[] {
  const messages = useChatHistory((state) => {
    const sid = sessionId ?? state.activeSessionId;
    return sid ? state.messagesById[sid] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  });

  return useMemo(() => {
    // 明细视图没开就不扫：流式期 messages 每 tick 换新引用，关着扫等于白付全量税。
    if (!enabled) return EMPTY_PRODUCTS;
    const items = collectSessionProducts(messages);
    return items.length ? items : EMPTY_PRODUCTS;
  }, [messages, enabled]);
}
