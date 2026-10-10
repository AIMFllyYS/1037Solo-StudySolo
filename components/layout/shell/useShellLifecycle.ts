import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useStore } from "@/lib/stores/ui";

import { DURATION } from "@/lib/motion";

import { setWindowSessionProvider } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";

import type { resolveRouteLayout } from "@/lib/content/routeLayout";

import { appModeFromPathname, isAgentManagementPath, hrefForMobileAppMode } from "@/lib/constants/app-mode";
import { useAppMode } from "@/lib/stores/appMode";
import { hydrateSettings } from "@/lib/stores/settings";

interface ShellLifecycleInput {
  pathname: string;
  route: ReturnType<typeof resolveRouteLayout>['route'];
  isMobile: boolean;
  reducedMotion: boolean;
  isResizing: boolean;
}
export function useShellLifecycle({ pathname, route, isMobile, reducedMotion, isResizing }: ShellLifecycleInput) {

  const router = useRouter();
  const hydrateMode = useAppMode((s) => s.hydrate);
  const syncFromPathname = useAppMode((s) => s.syncFromPathname);
  const rememberStudioPath = useAppMode((s) => s.rememberStudioPath);
  const lastStudioPath = useAppMode((s) => s.lastStudioPath);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  /** 首帧布局写回（档位恢复 / autoSaveId）不算「拉出」，稳定后再让分栏参与缓动。 */
  const [panelMotionReady, setPanelMotionReady] = useState(false);
  const modeShellRef = useRef<HTMLDivElement>(null);
  const modeTransitionTimerRef = useRef<number | null>(null);
  const previousRouteModeRef = useRef<ReturnType<typeof appModeFromPathname>>(null);
  const setActiveRoute = useStore((s) => s.setActiveRoute);
  const setTocData = useStore((s) => s.setTocData);

  useLayoutEffect(() => {
    const nextMode = appModeFromPathname(pathname);
    const previousMode = previousRouteModeRef.current;
    previousRouteModeRef.current = nextMode;
    const shell = modeShellRef.current;

    // Stop a transition as soon as another route, a resize, or reduced-motion takes over.
    if (modeTransitionTimerRef.current !== null) {
      window.clearTimeout(modeTransitionTimerRef.current);
      modeTransitionTimerRef.current = null;
    }
    shell?.removeAttribute("data-mode-entering");

    if (!shell || !previousMode || !nextMode || previousMode === nextMode || reducedMotion || isResizing) {
      return undefined;
    }

    // Animate only the single committed shell. CSS handles reduced-motion and resize cancellation.
    shell.setAttribute("data-mode-entering", "true");
    modeTransitionTimerRef.current = window.setTimeout(() => {
      modeTransitionTimerRef.current = null;
      shell.removeAttribute("data-mode-entering");
    }, DURATION.fast * 1000);

    return () => {
      if (modeTransitionTimerRef.current !== null) {
        window.clearTimeout(modeTransitionTimerRef.current);
        modeTransitionTimerRef.current = null;
      }
      shell.removeAttribute("data-mode-entering");
    };
  }, [pathname, reducedMotion, isResizing]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPanelMotionReady(true);
      // 预绘制用的「硬收拢」CSS 只在挂载前生效（见 globals.css）：挂载后交给分栏库的
      // flex 内联样式，这样收起/展开才会走同一条横向缓动，而不是被 max-width 瞬间掐断。
      document.documentElement.setAttribute("data-panels-ready", "true");
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  useLayoutEffect(() => {
    hydrateLayout();
    hydrateMode();
    // 本机设置只能在客户端水合之后应用；首帧保持 DEFAULTS 才不会 hydration mismatch。
    hydrateSettings();
    syncFromPathname(pathname, { retainAgentOnStudio: isMobile });
    rememberStudioPath(pathname);
    if (route) setActiveRoute(route.subjectId, route.categoryId, route.itemId);
  }, [hydrateLayout, hydrateMode, syncFromPathname, rememberStudioPath, pathname, route, setActiveRoute, isMobile]);

  /**
   * 告诉窗口管理器「现在在哪个对话」：新开的窗口会自动记下归属，
   * Agent 右栏据此按会话隔离内容（见 lib/window/sessionScope.ts）。
   * 这里注入而不是让 windowManager 直接依赖 chatHistory —— 那会形成循环依赖。
   */
  useEffect(() => {
    setWindowSessionProvider(() => useChatHistory.getState().activeSessionId);
    return () => setWindowSessionProvider(null);
  }, []);

  useEffect(() => {
    // /c/<对话ID> 是深链：手机壳本来就能显示中央对话，弹回 Studio 首页等于把分享/深链弄丢。
    if (!isMobile || appModeFromPathname(pathname) !== "agent" || pathname.startsWith("/c/") || isAgentManagementPath(pathname)) return;
    const target = hrefForMobileAppMode("agent", lastStudioPath);
    if (target !== pathname) router.replace(target);
  }, [isMobile, pathname, lastStudioPath, router]);

  // TOC 数据只由内容页的 useToc 产出；离开内容页（首页 / review 等）时清掉，
  // 否则目录视图会残留上一页的标题树，点击也无法滚动（目标 DOM 已不存在）。
  // 内容页 → 内容页导航不清空，由新页面 hook 重建，避免闪烁。
  useEffect(() => {
    if (!route) setTocData([], null);
  }, [route, setTocData]);
  return { modeShellRef, panelMotionReady };
}
