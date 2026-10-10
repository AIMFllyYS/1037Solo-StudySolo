"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { PanelRightOpen } from "lucide-react";
import { useStore } from "@/lib/stores/ui";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";

import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";

import { PANEL_PRESETS } from "@/lib/constants/panelPresets";
import AgentDockColumn from "./AgentDockColumn";
import AgentPanelResizeHandle from "./AgentPanelResizeHandle";
import { useAgentPanelSizes } from "@/lib/hooks/layout/useAgentPanelSizes";
import { AGENT_CENTER_MIN_PX } from "@/lib/layout/agentPanelSizes";
import { useIsMobile } from "@/lib/hooks/layout/useIsMobile";
import { useCloseMobileSidebarOnModeChange } from "@/lib/hooks/layout/useCloseMobileSidebarOnModeChange";
import { useAcademicYear } from "@/lib/stores/academicYear";

import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";
import { NOTES_PANEL_ID, RIGHT_PANEL_ID } from "@/lib/constants/layout";

import { isSubjectReviewPath, resolveRouteLayout } from "@/lib/content/routeLayout";
import type { ChatContext } from "@/lib/types/chat";
import { appModeFromPathname, resolveAppMode, resolveMobileAppMode, usesMobileStudioChrome, usesStudioChrome } from "@/lib/constants/app-mode";
import { useAppMode } from "@/lib/stores/appMode";

import SubjectSidebar from "./navigation/SubjectSidebar";
import RightPanel from "./RightPanel";
import CenterWorkspace from "./center/CenterWorkspace";

import { useT } from "@/lib/i18n";
import { ChatSkeleton, PageLoader } from "@/components/shared/ResizeLoader";
import { PanelSkeleton } from "@/components/shared/LoadingStates";

import KeyboardShortcutProvider from "@/components/keyboard/KeyboardShortcutProvider";

import ToastHost from "@/components/shared/ToastHost";
import LoginOverlay from "@/components/auth/LoginOverlay";

import TopBar from "./shell/TopBar";
import { useShellLifecycle } from "./shell/useShellLifecycle";

// 移动端组件全部 dynamic：它们只在 isMobile 分支渲染，静态导入会把整套
// 移动壳（尤其 MobileMiniChat → ChatThread → react-markdown/KaTeX/ai SDK）
// 拉进所有路由的 eager chunk（实测 /login 也载 3.5MB）。ssr:false 无损失——
// isMobile 是客户端判定，SSR 从不渲染这些分支。
const MobileTopBar = dynamic(() => import("./mobile/MobileTopBar"), { ssr: false });
const MobileBottomNav = dynamic(() => import("./mobile/MobileBottomNav"), { ssr: false });
const MobileChapterPicker = dynamic(() => import("./mobile/MobileChapterPicker"), { ssr: false });
const MobileReviewHub = dynamic(() => import("./mobile/MobileReviewHub"), { ssr: false });
const MobileSettingsPanel = dynamic(() => import("./mobile/MobileSettingsPanel"), { ssr: false });
const MobileSidebarDrawer = dynamic(() => import("./mobile/MobileSidebarDrawer"), { ssr: false });
const MobileMiniChat = dynamic(() => import("./mobile/MobileMiniChat"), { ssr: false });

const PipPlayer = dynamic(() => import("@/components/video/PipPlayer"), { ssr: false });
const DeferredWindowLayers = dynamic(() => import("@/components/window/DeferredWindowLayers"), { ssr: false });
const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), { ssr: false, loading: () => <PanelSkeleton variant="chat" /> });
const AgentSettingsOverlay = dynamic(() => import("@/components/chat/settings/AgentSettingsOverlay"), { ssr: false });
const SchedulerRuntime = dynamic(() => import("@/components/agent/scheduler/SchedulerRuntime"), { ssr: false });
const SelectionAssistantGuard = dynamic(() => import("@/components/notes/SelectionAssistantGuard"), { ssr: false });
const BrowserTab = dynamic(() => import("@/components/browser/BrowserTab"), { ssr: false, loading: () => <PanelSkeleton variant="document" /> });

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isMobile = useIsMobile();
  const persistedMode = useAppMode((s) => s.mode);
  const resolvedMode = isMobile
    ? resolveMobileAppMode(pathname, persistedMode)
    : resolveAppMode(pathname, persistedMode);
  const studioChrome = isMobile ? usesMobileStudioChrome(pathname) : usesStudioChrome(pathname);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const mobileTab = useStore((s) => s.mobileTab);
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const activeItemId = useStore((s) => s.activeItemId);
  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const sidebarPersistReadyRef = useRef(false);
  const rightPersistReadyRef = useRef(false);
  const [, startTransition] = useTransition();
  const [isResizing, setIsResizing] = useState(false);
  const handleDragging = useCallback((dragging: boolean) => setIsResizing(dragging), []);

  useCloseMobileSidebarOnModeChange(resolvedMode, isMobile);

  const routeLayout = useMemo(() => resolveRouteLayout(pathname), [pathname]);
  const route = routeLayout.route;
  /** 只有 /agent 这一条路由用 Agent 专用外壳（左对话栏 + 中央对话 + 通顶的右侧工作区）。 */
  const isAgentRoute = !isMobile && appModeFromPathname(pathname) === "agent";
  /**
   * 「对话页」= 默认对话页 + 深链（/c/<对话ID>）两种。
   * 资产页 / 定时任务 / 插件市场不是对话页，顶栏三切面与分享按钮都不该出现。
   */
  const isChatRoute = pathname === "/agent" || pathname.startsWith("/c/");
  const agentDockCollapsed = useStore((s) => s.agentDockCollapsed);
  const setAgentDockCollapsed = useStore((s) => s.setAgentDockCollapsed);
  const agentDockGlobal = useAgentDockRuntime((s) => s.dockGlobal);
  const agentSizes = useAgentPanelSizes();
  const reducedMotion = useUiReducedMotion();
  const rightCollapsedByProfile = useStore((s) => s.rightCollapsedByProfile);
  const setRightCollapsedForProfile = useStore((s) => s.setRightCollapsedForProfile);

  const t = useT();
  const rightCollapsed = routeLayout.showRightPanel
    ? rightCollapsedByProfile[routeLayout.profile]
    : false;
  /** Studio 档位预设（agent 之外的现值集合，行为与改造前完全一致）。 */
  const studioPreset = routeLayout.showRightPanel
    ? PANEL_PRESETS[`studio:${routeLayout.profile}` as "studio:full" | "studio:article" | "studio:reference"]
    : PANEL_PRESETS["studio:no-right"];
  const { modeShellRef, panelMotionReady } = useShellLifecycle({ pathname, route, isMobile, reducedMotion, isResizing });

  useLayoutEffect(() => {
    sidebarPersistReadyRef.current = false;
    rightPersistReadyRef.current = false;
  }, [routeLayout.profile]);

  useEffect(() => {
    const panel = leftRef.current;
    if (!panel) return;
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!sidebarCollapsed && panel.isCollapsed()) panel.expand();
    const id = window.setTimeout(() => {
      sidebarPersistReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const panel = rightRef.current;
    if (!panel || !routeLayout.showRightPanel) return;
    if (rightCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!rightCollapsed && panel.isCollapsed()) panel.expand();
    const id = window.setTimeout(() => {
      rightPersistReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [rightCollapsed, routeLayout.showRightPanel, routeLayout.profile]);

  const academicYear = useAcademicYear((s) => s.year);
  const chatContext: ChatContext = useMemo(
    () => ({
      subjectId: activeSubjectId,
      categoryId: activeCategoryId,
      itemId: activeItemId,
      currentTopic: `${activeSubjectId} ${activeCategoryId} ${activeItemId}`,
      academicYear,
    }),
    [activeSubjectId, activeCategoryId, activeItemId, academicYear],
  );

  const isReviewRoute = isSubjectReviewPath(pathname);
  const showLessonPane =
    mobileTab === "detail" || (mobileTab === "review" && isReviewRoute);

  // ── Mobile layout ──────────────────────────────────────────
  const mobileSidebarOpen = useStore((s) => s.mobileSidebarOpen);
  const closeMobileSidebar = useStore((s) => s.setMobileSidebarOpen);

  /**
   * 公开分享页（/s/<shareId>）：裸壳。
   *
   * 为什么在这里短路、而不是给 /s 单独开一个路由分组：app/layout.tsx 把**所有**路由
   * 都包进了 <AppShell>，想换壳只能把 /s 挪进 (group) 之类的分组目录——那会同时改动
   * 全站的目录结构与所有布局判定（routeLayout / appModeFromPathname 都吃 pathname），
   * 为了一个只读页面牵动全站，不划算。
   *
   * 位置必须在**所有 hook 之后**：上面那些 useLayoutEffect / useEffect（hydrateLayout、
   * hydrateSettings、setWindowSessionProvider…）要继续跑，主题、语言、字号才会在分享页生效；
   * 提前 return 会连 hook 一起跳过，触发 "rendered fewer hooks" 且首帧闪一下默认主题。
   *
   * 裸壳只留 children 与 ToastHost：不要顶栏 / 左栏 / 右栏 / 移动底栏，
   * 也不要 KeyboardShortcutProvider（访客不该继承站主的快捷键）。
   */
  if (pathname.startsWith("/s/")) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--bg-app)]" data-share-shell>
        {children}
        <ToastHost />
      </div>
    );
  }

  if (isMobile) {
    return (
      <KeyboardShortcutProvider>
      <div ref={modeShellRef} className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--bg-app)]" data-app-mode={resolvedMode} data-subject={route?.subjectId ?? activeSubjectId ?? DEFAULT_SUBJECT} data-mobile-sidebar={mobileSidebarOpen || undefined}>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {studioChrome && <MobileSidebarDrawer />}
          <div
            className={clsx("mobile-shell-page flex h-full min-h-0 flex-col", studioChrome && mobileSidebarOpen && "is-shifted")}
          >
            <MobileTopBar />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {!studioChrome ? (
                <div className="absolute inset-0">{children}</div>
              ) : (
                <>
                  <div className={clsx("absolute inset-0", !showLessonPane && "invisible pointer-events-none")}>
                    {/* 被 ManagedWindow fullscreenTarget="notes" 用作全屏对齐目标，勿改 id */}
                    <div id={NOTES_PANEL_ID} className="h-full">
                      {children}
                    </div>
                  </div>
                  {mobileTab === "review" && !isReviewRoute && (
                    <div className="absolute inset-0">
                      <MobileReviewHub />
                    </div>
                  )}
                  {mobileTab === "ai" && (
                    <div className="absolute inset-0">
                      <ChatPanel chatContext={chatContext} />
                    </div>
                  )}
                  {mobileTab === "browser" && (
                    <div className="absolute inset-0">
                      <BrowserTab />
                    </div>
                  )}
                  {mobileTab === "settings" && (
                    <div className="absolute inset-0">
                      <MobileSettingsPanel />
                    </div>
                  )}
                  {studioChrome && <MobileMiniChat chatContext={chatContext} />}
                </>
              )}
              {studioChrome && mobileSidebarOpen && (
                <button
                  type="button"
                  className="mobile-sidebar-backdrop"
                  aria-label={t("app.topbar.closeSidebar")}
                  data-testid="mobile-sidebar-backdrop"
                  onClick={() => closeMobileSidebar(false)}
                />
              )}
            </div>
          </div>
        </div>

        {studioChrome && <MobileBottomNav />}
        {studioChrome && <MobileChapterPicker />}
        <AnimatePresence>
          <PipPlayer />
        </AnimatePresence>
        <DeferredWindowLayers />
        <AgentSettingsOverlay />
        <LoginOverlay />
        <SchedulerRuntime />
        <SelectionAssistantGuard />
        <ToastHost />
      </div>
      </KeyboardShortcutProvider>
    );
  }

  // ── Agent desktop layout：右侧工作区是独立一列，通到窗口最顶（与顶栏最上沿平齐）──
  if (isAgentRoute) {
    return (
      <KeyboardShortcutProvider>
      {/* Agent 外壳不挂 `data-layout-profile`：那是 Studio 内容页档位的语义，右栏开合有自己的 data 属性。 */}
      <div ref={modeShellRef} className="flex h-screen overflow-hidden bg-[var(--bg-app)]" style={{ "--agent-left-width": `${agentSizes.left}px` } as React.CSSProperties} data-resizing={isResizing || undefined} data-panels-ready={panelMotionReady || undefined} data-app-mode={resolvedMode} data-subject={activeSubjectId} data-agent-global={agentDockGlobal ? "true" : undefined} data-agent-shell>
        {/* 左右列共用像素尺寸状态：右列开合只改变中间余量，不触发嵌套比例恢复。 */}
        <div data-panel-group className="flex h-full min-h-0 w-full">
          <div data-panel-id="agent-shell-main" className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <TopBar
                subjectId={route?.subjectId ?? DEFAULT_SUBJECT}
                categoryId={route?.categoryId ?? "detail"}
                itemId={route?.itemId ?? ""}
                hideWindowTaskbar
                agentMode
                showCenterTabs={isChatRoute}
                dockOpen={!agentDockCollapsed}
                onToggleDock={() => {
                  setAgentDockCollapsed(!agentDockCollapsed);
                }}
              />
              <div className="min-h-0 flex-1">{children}</div>
            </div>
          </div>
          <AgentPanelResizeHandle
            side="right"
            value={agentSizes.right}
            min={240}
            max={Math.max(240, agentSizes.viewport - agentSizes.left - AGENT_CENTER_MIN_PX)}
            onResize={(pixels) => { agentSizes.setSize("right", pixels); if (agentDockCollapsed) setAgentDockCollapsed(false); }}
            onCollapse={() => setAgentDockCollapsed(true)}
            onDragging={handleDragging}
          />
          <div
            data-panel-id="agent-shell-dock"
            data-collapsed={agentDockCollapsed || undefined}
            aria-hidden={agentDockCollapsed && !agentDockGlobal || undefined}
            inert={agentDockCollapsed && !agentDockGlobal || undefined}
            className="h-full min-h-0 min-w-0 shrink-0 overflow-hidden"
            style={{ flexBasis: agentDockGlobal ? "auto" : agentSizes.right, width: agentDockGlobal ? undefined : agentSizes.right, flexGrow: agentDockGlobal ? 1 : 0 }}
          >
            <AgentDockColumn busy={isResizing} />
          </div>
        </div>
        {/* 业务窗口/全局浮层必须与 Studio 一样挂在这个壳里，否则右栏会出现"有标签没正文"。 */}
        <DeferredWindowLayers />
        <AgentSettingsOverlay />
        <LoginOverlay />
        <SchedulerRuntime />
        <SelectionAssistantGuard />
        <AnimatePresence>
          <PipPlayer />
        </AnimatePresence>
        <ToastHost />
      </div>
      </KeyboardShortcutProvider>
    );
  }

  // ── Desktop layout (unchanged) ─────────────────────────────
  return (
    <KeyboardShortcutProvider>
    <div ref={modeShellRef} className="flex h-screen flex-col overflow-hidden bg-[var(--bg-app)]" data-resizing={isResizing || undefined} data-panels-ready={panelMotionReady || undefined} data-app-mode={resolvedMode} data-subject={route?.subjectId ?? activeSubjectId ?? DEFAULT_SUBJECT} data-layout-profile={routeLayout.profile}>
      <TopBar
        subjectId={route?.subjectId ?? DEFAULT_SUBJECT}
        categoryId={route?.categoryId ?? "detail"}
        itemId={route?.itemId ?? ""}
        hideWindowTaskbar={resolvedMode === "agent"}
        agentMode={resolvedMode === "agent"}
        classMode={resolvedMode === "class"}
        reviewMode={resolvedMode === "review"}
      />
      {!studioChrome ? (
      <div className="min-h-0 flex-1">
        {children}
      </div>
      ) : (
      <div className="min-h-0 flex-1">
        <PanelGroup
          key={routeLayout.profile}
          direction="horizontal"
          autoSaveId={routeLayout.profile === "full" ? "gailvlun-layout-v2" : `gailvlun-layout-v2-${routeLayout.profile}`}
        >
          <Panel
            ref={leftRef}
            id="sidebar"
            order={1}
            collapsible
            collapsedSize={0}
            minSize={13}
            defaultSize={studioPreset.left}
            maxSize={34}
            onCollapse={() => {
              if (!sidebarPersistReadyRef.current) return;
              startTransition(() => setSidebarCollapsed(true));
            }}
            onExpand={() => {
              if (!sidebarPersistReadyRef.current) return;
              startTransition(() => setSidebarCollapsed(false));
            }}
          >
            <SubjectSidebar />
          </Panel>

          <PanelResizeHandle onDragging={handleDragging} className="group relative w-px bg-[var(--line-soft)] outline-none data-[resize-handle-state=drag]:bg-[var(--accent)]">
            <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="block h-7 w-1 rounded-full bg-[var(--accent)]/40" />
            </span>
          </PanelResizeHandle>

          <Panel id="notes" order={2} minSize={32} defaultSize={routeLayout.showRightPanel ? studioPreset.center : PANEL_PRESETS["studio:no-right"].center}>
            <div className="relative h-full w-full">
              {/* 被 ManagedWindow fullscreenTarget="notes" 用作全屏对齐目标，勿改 id */}
              <div id={NOTES_PANEL_ID} className="h-full w-full">
                <CenterWorkspace>{children}</CenterWorkspace>
              </div>
              {routeLayout.showRightPanel && (
                <button
                  type="button"
                  data-expand-ai
                  onClick={() => setRightCollapsedForProfile(routeLayout.profile, false)}
                  title={t("app.topbar.expandAiPanel")}
                  aria-label={t("app.topbar.expandAiPanel")}
                  className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg border border-r-0 border-[var(--line)] bg-[var(--bg-panel)] px-1.5 py-3 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
                >
                  <PanelRightOpen size={16} />
                  <span>AI</span>
                </button>
              )}
              {isResizing && <PageLoader />}
            </div>
          </Panel>

          {routeLayout.showRightPanel && (
            <>
              <PanelResizeHandle onDragging={handleDragging} className="group relative w-px bg-[var(--line-soft)] outline-none data-[resize-handle-state=drag]:bg-[var(--accent)]">
                <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="block h-7 w-1 rounded-full bg-[var(--accent)]/40" />
                </span>
              </PanelResizeHandle>

              <Panel
                ref={rightRef}
                id="right"
                order={3}
                collapsible
                collapsedSize={0}
                minSize={22}
                defaultSize={rightCollapsed ? 0 : studioPreset.rightExpanded}
                onCollapse={() => {
                  if (!rightPersistReadyRef.current) return;
                  startTransition(() => setRightCollapsedForProfile(routeLayout.profile, true));
                }}
                onExpand={() => {
                  if (!rightPersistReadyRef.current) return;
                  startTransition(() => setRightCollapsedForProfile(routeLayout.profile, false));
                }}
              >
                <div id={RIGHT_PANEL_ID} className="relative h-full">
                  <RightPanel />
                  {isResizing && <ChatSkeleton />}
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      )}
      <AnimatePresence>
        <PipPlayer />
      </AnimatePresence>
      <DeferredWindowLayers />
      <AgentSettingsOverlay />
      <LoginOverlay />
      <SchedulerRuntime />
      <SelectionAssistantGuard />
      <ToastHost />
    </div>
    </KeyboardShortcutProvider>
  );
}
