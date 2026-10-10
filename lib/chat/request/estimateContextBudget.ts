import {
  FIRST_TURN_OVERHEAD_TOKENS,
  estimateFullContextTokens,
  isSoftLimitReached,
  resolveSessionContextBudget,
} from "@/lib/context/estimateFullContext";
import type { RequestMessage } from "@/lib/chat/request/buildRequestMessages";
import type { ContextBreakdown } from "@/lib/types/chat";

export interface ContextTrackerSnapshot {
  sessionContextBudgetTokens: number;
  serverContextTokens: number;
}

export const CONTEXT_WARNING =
  "上下文已达到 80% 软上限，需要时将由 AI 整理较早对话；原始聊天历史与附件引用仍保留。";

export interface ContextBudget {
  limit: number;
  estimated: number;
  softLimitReached: boolean;
}

export function estimateContextBudget(
  tracker: ContextTrackerSnapshot,
  model: { contextK?: number } | undefined,
  messages: RequestMessage[],
  userContent: string,
): ContextBudget {
  const modelLimit = (model?.contextK ?? 128) * 1000;
  const limit = resolveSessionContextBudget(tracker.sessionContextBudgetTokens, modelLimit);
  const historyText = messages
    .map((m) =>
      m.parts
        .map((p) => (p.type === "text" ? p.text : JSON.stringify(p)))
        .join(""),
    )
    .join("");
  const estimated = tracker.serverContextTokens > 0
    ? estimateFullContextTokens({ extraTokens: tracker.serverContextTokens, historyText: userContent })
    : estimateFullContextTokens({ historyText, extraTokens: FIRST_TURN_OVERHEAD_TOKENS });
  return { limit, estimated, softLimitReached: isSoftLimitReached(estimated, limit) };
}

/** 环显示：截断态取垫高值，避免假降；判定仍用 budget.estimated。 */
export function displayContextTokens(
  tracker: { contextBreakdown: ContextBreakdown | null; currentContextTokens: number },
  budget: ContextBudget,
): number {
  if (!budget.softLimitReached) return budget.estimated;
  const padded = tracker.contextBreakdown?.displayTotal ?? tracker.currentContextTokens;
  return Math.max(budget.estimated, padded);
}
