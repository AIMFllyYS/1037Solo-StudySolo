import { useChatHistory } from '../../stores/chat/chatHistory';

/**
 * 对话可交互：manifest 已加载，且当前 active 会话消息已就绪（或无 active 会话）。
 * selector 返回 boolean：store 每 tick set 都跑选择器，但只有真值翻转才重渲。
 */
export function useChatReady(sessionId?: string | null): boolean {
  return useChatHistory((s) => {
    if (!s._hasHydrated) return false;
    if (sessionId !== undefined) {
      if (!sessionId) return true;
      return !!s.messagesById[sessionId] || s.sessionLoadState[sessionId] === 'loaded';
    }
    if (!s.activeSessionId) return true;
    return s._activeMessagesReady;
  });
}
