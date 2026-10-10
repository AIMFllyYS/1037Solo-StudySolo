"use client";

import { useEffect, useRef } from "react";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useStore } from "@/lib/stores/ui";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { filterWindowsForSession, useActiveChatSessionId } from "@/lib/window/sessionScope";

/**
 * Stable outer host for the Agent right workspace. The actual content node is
 * owned by RightPanel so the tab bar stays outside every window portal.
 *
 * 它只做两件外壳级的事：把用户「收起右栏」的意图同步给标签条（`data-dock-collapsed`），
 * 以及在没有活动窗口时把活动权交给 z 最高的窗口（`activeWindowId` 是唯一真相源）。
 */
export default function AgentDockHost({ children }: { children: React.ReactNode }) {
  const windows = useWindowManager((state) => state.windows);
  const activeWindowId = useWindowManager((state) => state.activeWindowId);
  const setActiveWindow = useWindowManager((state) => state.setActiveWindow);
  const dockCollapsed = useStore((state) => state.agentDockCollapsed);
  const setAgentDockCollapsed = useStore((state) => state.setAgentDockCollapsed);
  const openRequest = useAgentDockRuntime((state) => state.openRequest);
  const dockGlobal = useAgentDockRuntime((state) => state.dockGlobal);
  const setDockGlobal = useAgentDockRuntime((state) => state.setDockGlobal);
  const handledOpenRequest = useRef(openRequest);
  const activeSessionId = useActiveChatSessionId();

  useEffect(() => {
    if (!isAgentWorkspace()) return;
    // 只看当前对话的窗口：否则切到 B 对话时，宿主会把 A 的窗口重新选成活动窗口，
    // 右栏就穿帮了（内容换了、标签条却还是 A 的）。
    const visible = filterWindowsForSession(windows, activeSessionId).filter((window) => !window.minimized);
    if (openRequest !== handledOpenRequest.current) {
      handledOpenRequest.current = openRequest;
      if (dockCollapsed) setAgentDockCollapsed(false);
    }

    if (visible.length === 0) return;
    if (activeWindowId && visible.some((window) => window.id === activeWindowId)) return;
    const next = visible.reduce((top, window) => (window.z > top.z ? window : top));
    setActiveWindow(next.id);
  }, [activeSessionId, activeWindowId, dockCollapsed, openRequest, setActiveWindow, setAgentDockCollapsed, windows]);

  // 「全屏」不落盘：右栏一收起就自动退出，不会留下半个全屏态。
  // （窗口增删不用管：全屏是面板级状态，切标签就是切全屏里显示的内容。）
  useEffect(() => {
    if (dockGlobal && dockCollapsed) setDockGlobal(false);
  }, [dockCollapsed, dockGlobal, setDockGlobal]);

  return (
    <div
      data-agent-dock-host
      data-dock-collapsed={dockCollapsed || undefined}
      className="flex h-full min-h-0 min-w-0 flex-col"
    >
      {children}
    </div>
  );
}
