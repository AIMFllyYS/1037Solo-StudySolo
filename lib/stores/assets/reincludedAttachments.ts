import { create } from 'zustand';

/**
 * 「重新带入本轮」意图：把某条历史消息的图片附件重新挂到**下一次**请求上。
 *
 * 为什么单独放一个 store：历史图片字节一直都在本机 IndexedDB 里（不丢），丢的是
 * "进不进这次 POST"——默认每轮只带最近一条 user 消息的附件。用户点一下按钮，就是
 * 把这条消息重新标成本轮附件；发送时读取并清空，所以它是**一次性意图**，不落盘、
 * 不跨会话、也不会在后续每轮都偷偷带上。
 */
interface ReincludedAttachmentsState {
  /** sessionId → 被点过「重新带入本轮」的消息 id（按点击顺序）。 */
  bySession: Record<string, string[]>;
  mark: (sessionId: string, messageId: string) => void;
  unmark: (sessionId: string, messageId: string) => void;
  isMarked: (sessionId: string, messageId: string) => boolean;
  /** 取出并清空（发送时调用一次）。 */
  takeForRequest: (sessionId: string) => string[];
}

export const useReincludedAttachments = create<ReincludedAttachmentsState>((set, get) => ({
  bySession: {},
  mark: (sessionId, messageId) =>
    set((state) => {
      if (!sessionId || !messageId) return state;
      const current = state.bySession[sessionId] ?? [];
      if (current.includes(messageId)) return state;
      return { bySession: { ...state.bySession, [sessionId]: [...current, messageId] } };
    }),
  unmark: (sessionId, messageId) =>
    set((state) => {
      const current = state.bySession[sessionId] ?? [];
      if (!current.includes(messageId)) return state;
      const next = current.filter((id) => id !== messageId);
      const bySession = { ...state.bySession };
      if (next.length > 0) bySession[sessionId] = next;
      else delete bySession[sessionId];
      return { bySession };
    }),
  isMarked: (sessionId, messageId) => (get().bySession[sessionId] ?? []).includes(messageId),
  takeForRequest: (sessionId) => {
    const current = get().bySession[sessionId] ?? [];
    if (current.length === 0) return [];
    set((state) => {
      const bySession = { ...state.bySession };
      delete bySession[sessionId];
      return { bySession };
    });
    return current;
  },
}));
