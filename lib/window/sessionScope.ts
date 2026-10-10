"use client";

import { useChatHistory } from "@/lib/stores/chat/chatHistory";

/**
 * 「这个窗口属于哪个对话」的唯一判定。
 *
 * 口径（用户要求）：右侧工作区跟着对话走 —— A 对话开着 A 的文档，切到 B 就不该看见它；
 * 切回 A 时，A 的面板状态与内容要回来。
 *
 * 未标记（`sessionId` 为空）的窗口一律**可见**：Studio 打开的老窗口、测试里手工构造的窗口
 * 都不该因为这条规则凭空消失。
 */
export function windowBelongsToSession(
  windowSessionId: string | null | undefined,
  activeSessionId: string | null,
): boolean {
  if (!windowSessionId) return true;
  return windowSessionId === activeSessionId;
}

export function filterWindowsForSession<T extends { sessionId?: string | null }>(
  windows: readonly T[],
  activeSessionId: string | null,
): T[] {
  return windows.filter((window) => windowBelongsToSession(window.sessionId, activeSessionId));
}

/** 当前对话 id（Agent 右栏的隔离键）。 */
export function useActiveChatSessionId(): string | null {
  return useChatHistory((state) => state.activeSessionId);
}