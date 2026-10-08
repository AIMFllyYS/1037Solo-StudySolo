"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { PanelTopClose, PanelTopOpen, PanelRightOpen, Maximize, Minimize } from "lucide-react";
import { useStore } from "@/lib/stores/ui";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { DURATION } from "@/lib/motion";
import { useUiReducedMotion } from "@/lib/hooks/useUiReducedMotion";
import { setWindowSessionProvider } from "@/lib/stores/windowManager";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { expandAgentDockIfCollapsed, PANEL_PRESETS } from "@/lib/constants/panelPresets";
import AgentDockColumn from "./AgentDockColumn";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useCloseMobileSidebarOnModeChange } from "@/lib/hooks/useCloseMobileSidebarOnModeChange";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { getSubject, getCategory, getContentItem } from "@/lib/content-data";
import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";
import { NOTES_PANEL_ID, RIGHT_PANEL_ID } from "@/lib/constants/layout";
import type { SubjectId } from "@/lib/types/content";
import { isSubjectReviewPath, resolveRouteLayout } from "@/lib/content/routeLayout";
import type { ChatContext } from "@/lib/types/chat";
import {
  appModeFromPathname,
  isAgentManagementPath,
  hrefForMobileAppMode,
  resolveAppMode,
  resolveMobileAppMode,
  usesMobileStudioChrome,
  usesStudioChrome,
} from "@/lib/constants/app-mode";
import { useAppMode } from "@/lib/stores/appMode";
import { hydrateSettings } from "@/lib/stores/settings";
import { useBrowserFullscreen } from "@/lib/hooks/useBrowserFullscreen";
import SubjectSidebar from "./SubjectSidebar";
import RightPanel from "./RightPanel";
import CenterWorkspace from "./center/CenterWorkspace";
import ModeSwitcher from "./ModeSwitcher";
import { AgentCenterTabsLive } from "@/components/agent/AgentCenterTabs";
import { useT } from "@/lib/i18n";
// 移动端组件全部 dynamic：它们只在 isMobile 分支渲染，静态导入会把整套
// 移动壳（尤其 MobileMiniChat → ChatThread → react-markdown/KaTeX/ai SDK）
// 拉进所有路由的 eager chunk（实测 /login 也载 3.5MB）。ssr:false 无损失——
// isMobile 是客户端判定，SSR 从不渲染这些分支。
const MobileTopBar = dynamic(() => import("./MobileTopBar"), { ssr: false });
const MobileBottomNav = dynamic(() => import("./MobileBottomNav"), { ssr: false });
const MobileChapterPicker = dynamic(() => import("./MobileChapterPicker"), { ssr: false });
const MobileReviewHub = dynamic(() => import("./MobileReviewHub"), { ssr: false });
const MobileSettingsPanel = dynamic(() => import("./MobileSettingsPanel"), { ssr: false });
const MobileSidebarDrawer = dynamic(() => import("./MobileSidebarDrawer"), { ssr: false });
const MobileMiniChat = dynamic(() => import("./MobileMiniChat"), { ssr: false });
import { ChatSkeleton, PageLoader } from "@/components/shared/ResizeLoader";
import { PanelSkeleton } from "@/components/shared/LoadingStates";
import WindowTaskbar from "@/components/window/WindowTaskbar";
import GlobalSearchButton from "@/components/search/GlobalSearchButton";
import KeyboardShortcutProvider from "@/components/keyboard/KeyboardShortcutProvider";
import { formatShortcut } from "@/lib/keyboard/format";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";
import ToastHost from "@/components/shared/ToastHost";
import LoginOverlay from "@/components/auth/LoginOverlay";
import ShareButton from "@/components/share/ShareButton";
import SourcesPanelToggle from "@/components/agent/SourcesPanelToggle";

const PipPlayer = dynamic(() => import("@/components/video/PipPlayer"), { ssr: false });
const DeferredWindowLayers = dynamic(() => import("@/components/window/DeferredWindowLayers"), { ssr: false });
const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), { ssr: false, loading: () => <PanelSkeleton variant="chat" /> });
const AgentSettingsOverlay = dynamic(() => import("@/components/chat/AgentSettingsOverlay"), { ssr: false });
const SchedulerRuntime = dynamic(() => import("@/components/agent/scheduler/SchedulerRuntime"), { ssr: false });
const SelectionAssistantGuard = dynamic(() => import("@/components/notes/SelectionAssistantGuard"), { ssr: false });
const BrowserTab = dynamic(() => import("@/components/browser/BrowserTab"), { ssr: false, loading: () => <PanelSkeleton variant="document" /> });

/** 分栏缓动时长（唯一真相源是 globals.css 的 `--duration-pane`，这里只是读出来给定时器用）。 */
function paneDurationMs(): number {
  if (typeof window === "undefined") return 1000;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--duration-pane").trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 1000;
  return raw.endsWith("ms") ? value : value * 1000;
}

function TopBar({
  subjectId,
  categoryId,
  itemId,
  hideWindowTaskbar = false,
  agentMode = false,
  classMode = false,
  reviewMode = false,
  dockOpen = false,
  onToggleDock,
  showCenterTabs = false,
}: {
  subjectId: SubjectId;
  categoryId: string;
  itemId: string;
  hideWindowTaskbar?: boolean;
  /** Agent 工作区：顶栏只留品牌 + 全屏 + 右侧工作区开关，面包屑/全局搜索/收起顶栏都不在这里。 */
  agentMode?: boolean;
  classMode?: boolean;
  /** Review 工作区：顶栏只留品牌 + 全屏（复习页有自绘左侧栏，无需 Studio 面包屑/搜索/顶栏收起）。 */
  reviewMode?: boolean;
  /** 右侧工作区当前是否展开（Agent 模式）。 */
  dockOpen?: boolean;
  onToggleDock?: () => void;
  /** Agent 对话页：把「回答 / 来源 / 图片」分段开关并进这一行（用户口径：不要再起第二个顶部导航栏）。 */
  showCenterTabs?: boolean;
}) {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const topBarCollapsed = useStore((s) => s.topBarCollapsed);
  const toggleTopBar = useStore((s) => s.toggleTopBar);
  const sidebarShortcutEnabled = useKeyboardSettings((s) => s.isEnabled("global.toggleSidebar"));

  const { isFullscreen, toggleFullscreen } = useBrowserFullscreen();
  const t = useT();

  /**
   * Agent 顶栏是**控件条**（网页全屏 + 右侧工作区开关），它自己没有「收起顶栏」入口，
   * 所以不能沿用 Studio 那个会落盘的收起态：从 Studio 收着顶栏切到 Agent，
   * h-0 会把这两个键一起吃掉——既没有面板开关，也没有全屏入口（Esc 之外无路可回）。
   */
  const barCollapsed = !agentMode && !classMode && !reviewMode && topBarCollapsed;

  const subject = getSubject(subjectId);
  const category = getCategory(subjectId, categoryId);
  const item = getContentItem(subjectId, categoryId, itemId);

  return (
    <header
      data-topbar
      data-agent-bar={agentMode ? "true" : undefined}
      data-class-bar={classMode ? "true" : undefined}
      className={clsx(
        "relative flex shrink-0 items-center gap-3 bg-[var(--bg-panel)] px-3 transition-all duration-300 ease-out overflow-hidden",
        barCollapsed ? "h-0 border-b-0 py-0" : "h-12 border-b border-[var(--line-soft)]",
      )}
    >
      {/* 桌面各模式共用一个实际左导航开关与状态；Class / Review 的子工作区订阅同一 store。 */}
      <button
        onClick={toggleSidebar}
        title={
          sidebarShortcutEnabled
            ? `${sidebarCollapsed ? t("app.topbar.expandNav") : t("app.topbar.collapseNav")} ${formatShortcut("global.toggleSidebar")}`
            : sidebarCollapsed ? t("app.topbar.expandNav") : t("app.topbar.collapseNav")
        }
        aria-label={sidebarCollapsed ? t("app.topbar.expandNav") : t("app.topbar.collapseNav")}
        aria-pressed={sidebarCollapsed}
        data-testid="sidebar-toggle"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <ModeSwitcher />
      {!agentMode && !classMode && !reviewMode && <div className="ml-2 flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--ink-faint)]">
        {subject && (
          <>
            <span className="shrink-0">·</span>
            <span className="shrink-0 truncate font-medium text-[var(--ink-soft)]">
              {subject.name}
            </span>
          </>
        )}
        {category && (
          <>
            <span className="shrink-0 text-[var(--ink-faint)]">/</span>
            <span className="shrink-0 truncate">
              {category.name}
            </span>
            {item && (
              <>
                <span className="shrink-0 text-[var(--ink-faint)]">/</span>
                <span className="truncate font-medium text-[var(--ink-soft)]">
                  {itemId} {item.title}
                </span>
              </>
            )}
          </>
        )}
      </div>}

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1">
        {!topBarCollapsed && !agentMode && !reviewMode && (
          <div className="mr-1 flex min-w-0 flex-1 items-center justify-end gap-1 border-r border-[var(--line-soft)] pr-2">
            <GlobalSearchButton />
            {!hideWindowTaskbar && <WindowTaskbar host="topbar" />}
          </div>
        )}
        {!agentMode && !classMode && !reviewMode && (
          <button
            onClick={toggleTopBar}
            title={topBarCollapsed ? t("app.topbar.expandTopBar") : t("app.topbar.collapseTopBar")}
            aria-pressed={topBarCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
          >
            {topBarCollapsed ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
          </button>
        )}
        {/* 分享入口：放在全屏 / 右侧工作区这一组的左侧。
            只在 Agent 对话页出现，判定直接复用 showCenterTabs（= isChatRoute），
            资产页等 /agent 子路由不会多出一个没有对话可分享的按钮。 */}
        {showCenterTabs && <ShareButton />}
        {/* 来源悬浮窗的开关：用户口径放在「分享」与「全屏」之间，默认显示。
            与「右侧工作区」那个开关是两回事——前者管浮层，后者管统一面板。 */}
        {showCenterTabs && <SourcesPanelToggle />}
        {/* 网页全屏（F11）。Studio 里它在顶栏右端；Agent 里它落在**中间对话顶部**、
            紧贴「右侧工作区开关」左侧——两个控制同一块面板的键挨在一起，才找得到。
            它与右栏那个「全屏」（面板接管工作区）是两回事，所以图标必须一眼分得开：
            这里用四角 Maximize / Minimize，右栏用对角箭头 Maximize2 / Minimize2。 */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? t("app.topbar.exitFullscreen") : t("app.topbar.enterFullscreen")}
          aria-label={isFullscreen ? t("app.topbar.exitFullscreen") : t("app.topbar.enterFullscreen")}
          aria-pressed={isFullscreen}
          data-testid="browser-fullscreen"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
        {showCenterTabs && (
          /**
           * 三个切面**靠左对齐**，与下面的对话正文同一条左边界（用户口径：要偏左，跟 Perplexity 一样）。
           * 偏移量在 globals.css 的 `.agent-center-tabs-overlay` 里算：左边让开对话栏 +
           * 正文那条内边距，右边让开来源列 —— 少让右边这一下它会压到来源卡片上。
           */
          <div className="agent-center-tabs-overlay pointer-events-none absolute inset-y-0 flex items-center">
            <div className="pointer-events-auto">
              <AgentCenterTabsLive />
            </div>
          </div>
        )}
        {agentMode && (
          <button
            onClick={onToggleDock}
            title={dockOpen ? t("app.topbar.collapseDock") : t("app.topbar.expandDock")}
            aria-label={dockOpen ? t("app.topbar.collapseDock") : t("app.topbar.expandDock")}
            aria-pressed={dockOpen}
            data-testid="agent-dock-toggle"
            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
          >
            <PanelRightOpen size={18} />
          </button>
        )}
      </div>
    </header>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const isMobile = useIsMobile();
  const hydrateMode = useAppMode((s) => s.hydrate);
  const syncFromPathname = useAppMode((s) => s.syncFromPathname);
  const rememberStudioPath = useAppMode((s) => s.rememberStudioPath);
  const persistedMode = useAppMode((s) => s.mode);
  const lastStudioPath = useAppMode((s) => s.lastStudioPath);
  const resolvedMode = isMobile
    ? resolveMobileAppMode(pathname, persistedMode)
    : resolveAppMode(pathname, persistedMode);
  const studioChrome = isMobile ? usesMobileStudioChrome(pathname) : usesStudioChrome(pathname);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
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
  /** 首帧布局写回（档位恢复 / autoSaveId）不算「拉出」，稳定后再让分栏参与缓动。 */
  const [panelMotionReady, setPanelMotionReady] = useState(false);
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
  const agentDockRef = useRef<ImperativePanelHandle>(null);
  /** Retained until the panel reports the requested state, including deferred callbacks. */
  const pendingDockRestoreRef = useRef<boolean | null>(null);
  /**
   * 右栏宽度正在变化（拖拽 / 收起展开动画）。
   * 窄宽度下右栏的标签与业务正文会被响应式压成竖排单字，很难看；这期间盖一层骨架屏，
   * 顺带把过渡期每帧的正文重排省掉（骨架只跑 transform/opacity）。
   */
  const [dockBusy, setDockBusy] = useState(false);
  const dockBusyTimerRef = useRef<number | null>(null);
  const reducedMotion = useUiReducedMotion();
  const modeShellRef = useRef<HTMLDivElement>(null);
  const modeTransitionTimerRef = useRef<number | null>(null);
  const previousRouteModeRef = useRef<ReturnType<typeof appModeFromPathname>>(null);
  const markDockBusy = useCallback((ms: number) => {
    if (dockBusyTimerRef.current !== null) window.clearTimeout(dockBusyTimerRef.current);
    setDockBusy(true);
    dockBusyTimerRef.current = window.setTimeout(() => {
      dockBusyTimerRef.current = null;
      setDockBusy(false);
    }, ms);
  }, []);
  const setActiveRoute = useStore((s) => s.setActiveRoute);
  const setTocData = useStore((s) => s.setTocData);
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

    if (!shell || !previousMode || !nextMode || previousMode === nextMode || reducedMotion || isResizing || dockBusy) {
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
  }, [pathname, reducedMotion, isResizing, dockBusy]);

  // 顶栏开关 / 面板自身收起按钮改的是 store，这里把它同步到分栏面板上。
  useLayoutEffect(() => {
    if (!isAgentRoute) return;
    const panel = agentDockRef.current;
    if (!panel) return;
    try {
      if (agentDockCollapsed && !panel.isCollapsed()) {
        pendingDockRestoreRef.current = true;
        panel.collapse();
      }
      // A panel first mounted collapsed has no remembered expanded width yet; seed its first
      // restore with the current default. Existing user-resized widths still win inside expand().
      if (!agentDockCollapsed && panel.isCollapsed()) {
        pendingDockRestoreRef.current = false;
        expandAgentDockIfCollapsed(panel);
      }
    } catch {
      pendingDockRestoreRef.current = null;
      // 首帧还没有几何信息
    }
  }, [agentDockCollapsed, isAgentRoute, markDockBusy]);

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
      <div ref={modeShellRef} className="flex h-screen overflow-hidden bg-[var(--bg-app)]" data-resizing={isResizing || undefined} data-panels-ready={panelMotionReady || undefined} data-app-mode={resolvedMode} data-subject={activeSubjectId} data-agent-global={agentDockGlobal ? "true" : undefined} data-agent-shell>
        {/* v2 starts from the new 60% default; v1's old 37% layout remains untouched but is no longer loaded. */}
        <PanelGroup direction="horizontal" autoSaveId="studysolo-agent-shell-v2" className="h-full min-h-0 w-full">
          <Panel id="agent-shell-main" order={1} defaultSize={100 - PANEL_PRESETS.agent.right} minSize={36}>
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
                  markDockBusy(paneDurationMs() + 80);
                  setAgentDockCollapsed(!agentDockCollapsed);
                }}
              />
              <div className="min-h-0 flex-1">{children}</div>
            </div>
          </Panel>
          <PanelResizeHandle
            onDragging={handleDragging}
            className="group relative w-px bg-[var(--line-soft)] outline-none data-[resize-handle-state=drag]:bg-[var(--accent)]"
          >
            <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="block h-7 w-1 rounded-full bg-[var(--accent)]/40" />
            </span>
          </PanelResizeHandle>
          <Panel
            ref={agentDockRef}
            id="agent-shell-dock"
            order={2}
            collapsible
            collapsedSize={0}
            defaultSize={agentDockCollapsed ? 0 : PANEL_PRESETS.agent.right}
            minSize={20}
            maxSize={64}
            onResize={(size, previousSize) => {
              const collapsed = size === 0;
              if (previousSize === undefined) {
                // The saved panel geometry initializes before its imperative handle is ready.
                // Reconcile afterwards; initialization is never a user preference change.
                queueMicrotask(() => {
                  const panel = agentDockRef.current;
                  if (!panel) return;
                  try {
                    const wanted = useStore.getState().agentDockCollapsed;
                    if (panel.isCollapsed() === wanted) { pendingDockRestoreRef.current = null; return; }
                    pendingDockRestoreRef.current = wanted;
                    if (wanted) panel.collapse();
                    else expandAgentDockIfCollapsed(panel);
                  } catch { pendingDockRestoreRef.current = null; }
                });
                return;
              }
              if (pendingDockRestoreRef.current !== null) {
                if (collapsed === pendingDockRestoreRef.current) pendingDockRestoreRef.current = null;
                return;
              }
              if (collapsed === (previousSize === 0)) return;
              markDockBusy(paneDurationMs() + 80);
              setAgentDockCollapsed(collapsed);
            }}
          >
            <AgentDockColumn busy={dockBusy || isResizing} />
          </Panel>
        </PanelGroup>
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
