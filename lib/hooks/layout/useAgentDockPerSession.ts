"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { readAgentDockCollapsedPreference, useStore } from "@/lib/stores/ui";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { readAgentDockState, rememberAgentDockState, resolveAgentDockCollapsed } from "@/lib/window/agentDockSession";

/**
 * 右侧工作区的「一个对话一份记忆」。
 *
 * 规则（用户口径）：
 * - 每个对话各自记住自己离开时右栏是开是关、开的是哪个窗口、是不是「接管工作区」的全屏态；
 * - 切回某个对话 → 按它的内存记忆恢复；没有记忆（新对话 / 刷新后）→ 使用新版显式用户偏好，
 *   没有偏好时右栏默认展开；
 * - 我的资产 / 定时任务 / 插件市场这些非对话页 → 默认收起，且**不覆盖**对话的记忆
 *   （从资产页回到对话时，看到的是你离开那个对话时的样子）。
 *
 * 窗口内容本身按会话隔离，判定在 `lib/window/sessionScope.ts`（窗口带 sessionId）。
 */
export function useAgentDockPerSession(): void {
  const pathname = usePathname();
  // 深链 /c/<对话ID> 与 /agent 是同一个对话页的两种地址，右栏的「一个对话一份记忆」对它同样适用。
  // pathname 在测试/首帧可能是 null，用可选链兜住。
  const onChatRoute = pathname === "/agent" || Boolean(pathname?.startsWith("/c/"));
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const collapsed = useStore((s) => s.agentDockCollapsed);
  const setCollapsed = useStore((s) => s.setAgentDockCollapsedTransient);
  const dockGlobal = useAgentDockRuntime((s) => s.dockGlobal);
  const setDockGlobal = useAgentDockRuntime((s) => s.setDockGlobal);
  const activeWindowId = useWindowManager((s) => s.activeWindowId);
  const setActiveWindow = useWindowManager((s) => s.setActiveWindow);

  const sessionRef = useRef<string | null>(null);
  const snapshotRef = useRef({ collapsed, global: dockGlobal, activeWindowId });
  /** 上一帧是不是在对话页：用来识别「刚离开对话页」这一次。 */
  const wasOnChatRouteRef = useRef(onChatRoute);

  // 1) 会话换人、或者刚离开对话页（去资产/定时/插件）时，先把「上一个会话」的右栏状态写进内存表。
  //    只在对话页更新快照：在资产页被强制收起的那一下，不算这个对话的意愿。
  useEffect(() => {
    const previous = sessionRef.current;
    const leftChatRoute = wasOnChatRouteRef.current && !onChatRoute;
    const sessionChanged = Boolean(previous && previous !== activeSessionId);
    if (previous && (sessionChanged || leftChatRoute)) {
      rememberAgentDockState(previous, snapshotRef.current);
    }
    sessionRef.current = activeSessionId;
    if (onChatRoute) snapshotRef.current = { collapsed, global: dockGlobal, activeWindowId };
    wasOnChatRouteRef.current = onChatRoute;
  });

  // 2) 会话或路由变化：摆上目标状态（无会话记忆 = 新版显式偏好，未设置时展开）。
  useLayoutEffect(() => {
    if (!onChatRoute) {
      setCollapsed(true);
      setDockGlobal(false);
      setActiveWindow(null);
      return;
    }
    const restored = readAgentDockState(activeSessionId);
    setCollapsed(resolveAgentDockCollapsed(restored, readAgentDockCollapsedPreference()));
    setDockGlobal(Boolean(restored?.global));
    setActiveWindow(restored?.activeWindowId ?? null);
  }, [activeSessionId, onChatRoute, setActiveWindow, setCollapsed, setDockGlobal]);
}
