import type { ChatContext, ChatMessage } from "@/lib/types/chat";
import type { TurnSpineEntry } from "@/lib/chat/turnSpine";
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  context?: ChatContext;
  kind?: 'main' | 'floating' | 'note' | 'scheduled';
  /** Storage v2：历史列表在未加载消息体时使用 */
  messageCount?: number;
}

/** 已加载窗口的描述：messagesById[id] 保存的是轮次区间 [startTurn, turnCount) 的消息。 */
export interface SessionWindowMeta {
  startTurn: number;
  /** 窗口首条消息在全量数组里的下标。 */
  startIndex: number;
  turnCount: number;
  messageCount: number;
  spine: TurnSpineEntry[];
}
