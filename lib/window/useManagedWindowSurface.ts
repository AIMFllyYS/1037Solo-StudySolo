"use client";

import { useAppMode } from "@/lib/stores/appMode";
import { useStore } from "@/lib/stores/ui";
import { useIsMobile } from "@/lib/hooks/layout/useIsMobile";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { useDockTypingFocusGuard } from "@/lib/window/dockTypingFocus";
import { useActiveChatSessionId, windowBelongsToSession } from "@/lib/window/sessionScope";
import {
  isManagedWindowInteractive,
  resolveManagedWindowPresentation,
  type ManagedWindowPresentation,
} from "@/lib/window/presentation";

/**
 * 当前是否处于 Agent 工作区（Agent 路由或 Agent 模式）。
 * 窗口内部要按「在 Agent 里」调整布局时读它，Studio 永远返回 false。
 */
export function useIsAgentSurface(): boolean {
  const mode = useAppMode((state) => state.mode);
  return mode === "agent" || isAgentWorkspace();
}

export interface ManagedWindowSurface {
  /** 外壳形态：Studio 浮窗 / Agent 右栏停靠 / 窄屏 sheet / 宿主未就绪。 */
  presentation: ManagedWindowPresentation;
  /** 是否是当前正在展示的右栏窗口（dock 形态）。 */
  dockActive: boolean;
  /** 应该显示（最小化、右栏收起都算不显示）。 */
  visible: boolean;
  /** 参与 Esc 栈 / 快捷键 / 重编辑器挂载。 */
  interactive: boolean;
  /** 焦点停在本窗口之外的输入框时抑制前台 Esc（打字不误关右栏文档）。 */
  escapeSuppressed: boolean;
  /** portal 目标：dock 挂右栏内容宿主，其余挂 body。 */
  portalTarget: HTMLElement | null;
}

/**
 * 「这个 managed 窗口现在是什么形态、该不该显示、能不能吃键盘」的唯一解析入口。
 * 笔记窗挂重编辑器、ManagedWindow 渲染、窗口快捷键都读它，避免三处各写一份判断。
 */
export function useManagedWindowSurface(windowId: string): ManagedWindowSurface {
  const appMode = useAppMode((state) => state.mode);
  const isMobile = useIsMobile();
  const contentHost = useAgentDockRuntime((state) => state.contentHost);
  const activeWindowId = useWindowManager((state) => state.activeWindowId);
  const minimized = useWindowManager(
    (state) => state.windows.find((window) => window.id === windowId)?.minimized ?? true,
  );
  const windowSessionId = useWindowManager(
    (state) => state.windows.find((window) => window.id === windowId)?.sessionId ?? null,
  );
  const activeSessionId = useActiveChatSessionId();
  const dockCollapsed = useStore((state) => state.agentDockCollapsed);
  const escapeSuppressed = useDockTypingFocusGuard(contentHost);

  const presentation = resolveManagedWindowPresentation({
    agent: appMode === "agent" || isAgentWorkspace(),
    mobile: isMobile,
    dockHostAvailable: !!contentHost,
  });
  const dockActive = presentation === "dock" && activeWindowId === windowId;
  // 右栏是「每个对话一块」：别的对话开的窗口在本对话里既不显示也不吃键盘。
  const inThisSession = windowBelongsToSession(windowSessionId, activeSessionId);
  const visible = minimized
    ? false
    : presentation === "dock"
      ? dockActive && !dockCollapsed && inThisSession
      : true;
  const interactive =
    inThisSession &&
    isManagedWindowInteractive({
      presentation,
      minimized,
      active: dockActive,
      dockCollapsed,
    });

  return {
    presentation,
    dockActive,
    visible,
    interactive,
    escapeSuppressed,
    portalTarget: presentation === "dock" ? contentHost : typeof document === "undefined" ? null : document.body,
  };
}
