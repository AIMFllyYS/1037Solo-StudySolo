import { useMemo } from "react";
import { collectSessionSourceRounds } from "@/lib/chat/sources/traceSources";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import type { SourceRound, TraceSource } from "@/lib/chat/sources/traceSources";
import type { ChatMessage } from "@/lib/types/chat";

/** 没有对话时共用的空数组：选择器每次返回新 [] 会让 zustand 每帧都判定变化。 */
const EMPTY_MESSAGES: ChatMessage[] = [];

/** 这条对话的检索轮次 + 扁平来源清单。 */
export interface SessionSourceSet {
  /** 按消息顺序保序、跨轮去重后的检索轮次（"搜了什么 → 查到什么"）。 */
  rounds: SourceRound[];
  /** rounds 里所有来源的扁平视图（顺序一致、对象同一）：给"来源 · N"与点选定位用。 */
  sources: TraceSource[];
  /** sources.length，省得上层再算一遍。 */
  total: number;
}

/** 没有来源时共用的空结果：**同一个对象**，否则上层拿它当依赖会每帧重跑。 */
const EMPTY_SET: SessionSourceSet = { rounds: [], sources: [], total: 0 };

/**
 * 当前对话（activeSessionId）出现过的全部来源与检索轮次。
 *
 * 返回值按**消息数组引用**记忆：同一批消息重复渲染拿到的是同一个对象，
 * 上层的 useMemo / effect 依赖它才不会每帧重跑（这条是硬要求，见测试）。
 * 不在 store 上加字段——来源是从消息 parts 纯推导出来的派生数据。
 */
export function useSessionSourceRounds(sessionId?: string, enabled = true): SessionSourceSet {
  const messages = useChatHistory((state) => {
    const sid = sessionId ?? state.activeSessionId;
    return sid ? state.messagesById[sid] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  });

  return useMemo(() => {
    // 明细视图没开就不扫：流式期 messages 每 tick 换新引用，关着扫等于白付全量税。
    if (!enabled) return EMPTY_SET;
    const rounds = collectSessionSourceRounds(messages);
    if (!rounds.length) return EMPTY_SET;
    // 扁平视图与 rounds 共用同一批对象（不是拷贝）：面板靠 indexOf 反查条目下标。
    const sources = rounds.flatMap((round) => round.sources);
    return { rounds, sources, total: sources.length };
  }, [messages, enabled]);
}
