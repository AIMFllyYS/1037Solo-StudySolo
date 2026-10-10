import { useMemo } from "react";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import {
  spineDerivedTotals,
  turnCountsOf,
  type TurnDerivedCounts,
} from "@/lib/chat/turnSpine";

const EMPTY_TOTALS: TurnDerivedCounts = { sources: 0, images: 0, products: 0 };

/**
 * 这条会话的来源 / 图片 / 产物**合计**（含未加载轮次）。
 *
 * 窗口化后 messagesById 只装尾部几轮，逐个 hook 全扫既贵又不全；
 * spine 在会话打开时就绪，合计是一次 O(轮数) 求和，与消息体大小无关。
 * 缺窗口元信息时（老测试、直写内存态）退化为对已载数组计数——与旧语义一致。
 */
export function useSessionDerivedTotals(sessionId?: string): TurnDerivedCounts {
  const spine = useChatHistory((state) => {
    const sid = sessionId ?? state.activeSessionId;
    return sid ? state.sessionWindowById[sid]?.spine : undefined;
  });
  const fallback = useChatHistory((state) => {
    const sid = sessionId ?? state.activeSessionId;
    return sid && !state.sessionWindowById[sid] ? state.messagesById[sid] : undefined;
  });
  return useMemo(() => {
    if (spine) return spineDerivedTotals(spine);
    if (fallback?.length) return turnCountsOf(fallback);
    return EMPTY_TOTALS;
  }, [spine, fallback]);
}
