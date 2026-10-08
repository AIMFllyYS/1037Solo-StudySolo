"use client";

import { Component, useCallback, useEffect, useMemo, useState, useRef, type ErrorInfo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useIsClient } from "@/lib/hooks/useIsClient";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { MessageSquare, MonitorPlay, Hand, Globe, Maximize2, Minimize2, PanelRightClose, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore, type RightTab } from "@/lib/stores/ui";
import { resolveRouteLayout } from "@/lib/content/routeLayout";
import { tabPanelVariants } from "@/lib/motion";
import { useBrowser, BROWSE_TAB } from "@/lib/hooks/useBrowser";
import BrowserSettingsButton from "@/components/browser/BrowserSettingsButton";
import WindowTaskbar from "@/components/window/WindowTaskbar";
import AgentDockEmptyState from "@/components/window/AgentDockEmptyState";
import type { ChatContext } from "@/lib/types/chat";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { AGENT_DOCK_CONTENT_ID } from "@/lib/constants/layout";
import { useSettings } from "@/lib/hooks/useSettings";
import { filterWindowsForSession, useActiveChatSessionId } from "@/lib/window/sessionScope";
import { translate, useT } from "@/lib/i18n";
import StudioAgentPanel from "@/components/layout/StudioAgentPanel";
import { PanelSkeleton } from "@/components/shared/LoadingStates";

const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), {
  ssr: false,
  loading: () => <RightPanelTabLoading labelKey="panel.rightTab.ai" />,
});
const VideoTab = dynamic(() => import("@/components/video/VideoTab"), {
  ssr: false,
  loading: () => <RightPanelTabLoading labelKey="panel.rightTab.video" />,
});
const InteractiveTab = dynamic(() => import("@/components/interactives/InteractiveTab"), {
  ssr: false,
  loading: () => <RightPanelTabLoading labelKey="panel.rightTab.interactive" />,
});
const BrowserTab = dynamic(() => import("@/components/browser/BrowserTab"), {
  ssr: false,
  loading: () => <RightPanelTabLoading labelKey="panel.rightTab.browser" />,
});

const ALL_RIGHT_TABS: { id: RightTab; labelKey: string; icon: React.ReactNode }[] = [
  { id: "ai", labelKey: "panel.rightTab.ai", icon: <MessageSquare size={15} /> },
  { id: "video", labelKey: "panel.rightTab.video", icon: <MonitorPlay size={15} /> },
  { id: "interactive", labelKey: "panel.rightTab.interactive", icon: <Hand size={15} /> },
  { id: "browser", labelKey: "panel.rightTab.browser", icon: <Globe size={15} /> },
];

function RightPanelTabLoading({ labelKey }: { labelKey: string }) {
  const t = useT();
  const label = t(labelKey);
  return <PanelSkeleton variant={labelKey === "panel.rightTab.ai" ? "chat" : "document"} label={t("panel.rightTab.loading", { label })} />;
}

class RightPanelTabBoundary extends Component<
  { tab: RightTab; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RightPanel] tab render failed", {
      tab: this.props.tab,
      error,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: { tab: RightTab }) {
    if (prevProps.tab !== this.props.tab && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    // 类组件用不了 useT()：直接问 store 要当前语言。父级 RightPanel 换语言时会重渲染，
    // 这一层跟着重渲染就拿到新文案。
    const locale = useSettings.getState().locale;
    const tabKey = ALL_RIGHT_TABS.find((item) => item.id === this.props.tab)?.labelKey;
    const tabLabel = tabKey ? translate(locale, tabKey) : this.props.tab;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-1 text-[12px] font-medium text-[var(--ink-soft)]">
          {tabLabel}
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">{translate(locale, "panel.rightTab.errorTitle")}</h3>
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
          {translate(locale, "panel.rightTab.errorBody")}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="press rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          {translate(locale, "common.retry")}
        </button>
      </div>
    );
  }
}

export default function RightPanel({
  showWindowDock = false,
  hideBuiltinTabs = false,
  onCollapse,
}: {
  showWindowDock?: boolean;
  /**
   * Agent 工作区里不出现 AI 对话/动画讲解/可交互/浏览器这些内置栏目
   * （连同收藏夹与浏览器设置一起隐藏，正文区也不挂载任何内置栏目）。
   */
  hideBuiltinTabs?: boolean;
  /** 顶部「收起」按钮的落点。默认收起当前 Studio 档位的右栏；Agent 右栏由外壳传入。 */
  onCollapse?: () => void;
} = {}) {
  // Studio 桌面右栏：纯 Agent 对话（Cursor 式头）。它自持全部 hook，
  // 提前返回不违反 hooks 规则——这两个 prop 在一次挂载里恒定（Studio 恒为空、Agent 恒为 dock）。
  if (!showWindowDock && !hideBuiltinTabs) {
    return <StudioAgentPanel onCollapse={onCollapse} />;
  }

  return <RightPanelDock showWindowDock={showWindowDock} hideBuiltinTabs={hideBuiltinTabs} onCollapse={onCollapse} />;
}

function RightPanelDock({
  showWindowDock = false,
  hideBuiltinTabs = false,
  onCollapse,
}: {
  showWindowDock?: boolean;
  hideBuiltinTabs?: boolean;
  onCollapse?: () => void;
}) {
  const t = useT();
  const tab = useStore((s) => s.rightTab);
  const setTab = useStore((s) => s.setRightTab);
  const storeRightTabs = useStore((s) => s.rightTabs);
  const storeLayoutProfile = useStore((s) => s.layoutProfile);
  const pathname = usePathname();
  const routeLayout = useMemo(() => resolveRouteLayout(pathname), [pathname]);
  const rightTabs = routeLayout.route ? routeLayout.rightTabs : storeRightTabs;
  const layoutProfile = routeLayout.route ? routeLayout.profile : storeLayoutProfile;
  const setRightCollapsedForProfile = useStore((s) => s.setRightCollapsedForProfile);
  const managedWindows = useWindowManager((s) => s.windows);
  const activeWindowId = useWindowManager((s) => s.activeWindowId);
  const activeSessionId = useActiveChatSessionId();
  const registerContentHost = useAgentDockRuntime((s) => s.registerContentHost);
  const dockGlobal = useAgentDockRuntime((s) => s.dockGlobal);
  const setDockGlobal = useAgentDockRuntime((s) => s.setDockGlobal);
  const showRightPanelTabBar = useSettings((s) => s.showRightPanelTabBar);
  const visibleRightTabs = hideBuiltinTabs
    ? []
    : ALL_RIGHT_TABS.filter((t) => rightTabs.includes(t.id));
  const showBrowserChrome = !hideBuiltinTabs && rightTabs.includes("browser");
  const showTabBar = showRightPanelTabBar !== false;
  const showChrome = showTabBar || showWindowDock;
  // 只有「当前允许且可见」的栏目才挂正文：右栏收起内置栏目时（Agent），
  // 即便 store 里的 rightTab 还停在 video/browser，也不会把动画讲解渲染进右栏。
  const renderedTab = visibleRightTabs.some((t) => t.id === tab) ? tab : null;
  /**
   * Agent 右栏只认**当前对话**的窗口：A 对话开的文档、笔记、演示都不该出现在 B 的右栏里，
   * 标签条同理。Studio 走浮窗路径，不做这层筛选。
   */
  const dockWindows = useMemo(
    () => (showWindowDock ? filterWindowsForSession(managedWindows, activeSessionId) : managedWindows),
    [activeSessionId, managedWindows, showWindowDock],
  );
  // 右侧工具栏必须始终给「收起」和窗口标签留位置：内置工具标签在窗口坞出现时让出一部分宽度并横向滚动。
  const hasDockTabs = showWindowDock && dockWindows.length > 0;

  useEffect(() => {
    // Agent 右栏不展示内置栏目，也就没有「回退到某个内置 tab」这件事。
    if (hideBuiltinTabs) return;
    if (rightTabs.length > 0 && !rightTabs.includes(tab)) {
      setTab(rightTabs[0] ?? "ai");
    }
  }, [hideBuiltinTabs, rightTabs, tab, setTab]);

  useEffect(() => {
    if (hideBuiltinTabs) return;
    if (!showTabBar && rightTabs.includes("ai") && tab !== "ai") {
      setTab("ai");
    }
  }, [hideBuiltinTabs, showTabBar, rightTabs, tab, setTab]);

  // 追踪方向：比较新旧 tab index 决定滑入方向
  const tabIndex = visibleRightTabs.findIndex((t) => t.id === tab);
  const prevTabIndexRef = useRef(tabIndex);
  const [dir, setDir] = useState<1 | -1>(1);
  const variants = tabPanelVariants(dir);

  const switchTab = (next: RightTab) => {
    const newIdx = visibleRightTabs.findIndex((x) => x.id === next);
    setDir(newIdx >= prevTabIndexRef.current ? 1 : -1);
    prevTabIndexRef.current = newIdx;
    setTab(next);
  };

  const collapsePanel = useCallback(() => {
    if (onCollapse) {
      onCollapse();
      return;
    }
    setRightCollapsedForProfile(layoutProfile, true);
  }, [layoutProfile, onCollapse, setRightCollapsedForProfile]);

  const dockContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (showWindowDock) registerContentHost(node);
    },
    [registerContentHost, showWindowDock],
  );
  const managedSurfaceVisible =
    showWindowDock &&
    activeWindowId !== null &&
    dockWindows.some((window) => window.id === activeWindowId && !window.minimized);
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const activeItemId = useStore((s) => s.activeItemId);

  // 浏览器收藏夹标签
  const bookmarks = useBrowser((s) => s.bookmarks);
  const activeTabId = useBrowser((s) => s.activeTabId);
  const openBrowse = useBrowser((s) => s.openBrowse);
  const openBookmark = useBrowser((s) => s.openBookmark);
  const removeBookmark = useBrowser((s) => s.removeBookmark);

  // 避免 hydration mismatch：bookmarks 源自 localStorage，SSR 时使用默认值，
  // 客户端 hydrate 后才使用 localStorage 的真实数据。
  const mounted = useIsClient();
  const safeBookmarks = mounted ? bookmarks : [];

  const academicYear = useAcademicYear((s) => s.year);
  const chatContext: ChatContext = useMemo(() => ({
    subjectId: activeSubjectId,
    categoryId: activeCategoryId,
    itemId: activeItemId,
    currentTopic: `${activeSubjectId} ${activeCategoryId} ${activeItemId}`,
    academicYear,
  }), [activeSubjectId, activeCategoryId, activeItemId, academicYear]);

  return (
    <div className="flex h-full flex-col border-l border-[var(--line-soft)] bg-[var(--bg-panel)]">
      {/* Top-level tab bar（可横向滑动；含浏览器收藏夹标签 + 末尾「＋」） */}
      {showChrome && <div className="flex shrink-0 items-center gap-1 border-b border-[var(--line-soft)] px-1.5 py-1.5">
        <div className={clsx("hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto", hasDockTabs ? "shrink basis-auto max-w-[45%]" : "flex-1")}>
          {showTabBar && visibleRightTabs.map((item) => {
            const isActive =
              item.id === "browser"
                ? tab === "browser" && activeTabId === BROWSE_TAB
                : tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  switchTab(item.id);
                  if (item.id === "browser") openBrowse();
                }}
                className={clsx(
                  "press flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
                )}
              >
                {item.icon}
                {t(item.labelKey)}
              </button>
            );
          })}

          {/* 分隔符：核心标签 与 浏览器固定书签标签 分开 */}
          {showBrowserChrome && safeBookmarks.length > 0 && (
            <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--line-soft)]" aria-hidden />
          )}

          {/* 浏览器收藏夹标签（独立固定标签） */}
          {showBrowserChrome && safeBookmarks.map((bm) => {
            const active = tab === "browser" && activeTabId === bm.id;
            return (
              <span
                key={bm.id}
                className={clsx(
                  "group flex shrink-0 items-center gap-1 rounded-lg border py-1.5 pl-2 pr-1 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
                )}
              >
                <button
                  onClick={() => {
                    switchTab("browser");
                    openBookmark(bm.id);
                  }}
                  className="press flex items-center gap-1"
                  title={bm.url}
                >
                  <Globe size={12} />
                  <span className="max-w-[88px] truncate">{bm.name}</span>
                </button>
                <button
                  onClick={() => removeBookmark(bm.id)}
                  title={t("panel.rightTab.removeBookmark")}
                  className="rounded p-0.5 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--md-sys-color-error)] group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>

        {showWindowDock && (
          <div className={clsx("flex min-w-0 items-center justify-end", hasDockTabs ? "flex-1" : "shrink-0")}>
            <WindowTaskbar host="right-panel" />
          </div>
        )}
        {showBrowserChrome && <BrowserSettingsButton onAdded={() => switchTab("browser")} />}
        {showWindowDock && (
          <button
            type="button"
            onClick={() => setDockGlobal(!dockGlobal)}
            title={t(dockGlobal ? "agent.dock.shrink" : "agent.dock.global")}
            aria-label={t(dockGlobal ? "agent.dock.shrink" : "agent.dock.global")}
            aria-pressed={dockGlobal}
            data-testid="agent-dock-global"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
          >
            {dockGlobal ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        <button
          type="button"
          onClick={collapsePanel}
          title={t("agent.dock.collapse")}
          aria-label={t("agent.dock.collapse")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          <PanelRightClose size={16} />
        </button>
      </div>}

      {/* Content area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showWindowDock && (
          <div
            id={AGENT_DOCK_CONTENT_ID}
            ref={dockContentRef}
            className={clsx("absolute inset-0 min-h-0 min-w-0 overflow-hidden", !managedSurfaceVisible && "pointer-events-none")}
            aria-hidden={!managedSurfaceVisible}
          />
        )}
        <div className={clsx("h-full min-h-0", managedSurfaceVisible && "invisible pointer-events-none")}>
          {showWindowDock && !managedSurfaceVisible && (
            <AgentDockEmptyState hasHiddenWindows={dockWindows.length > 0} />
          )}
          {!showWindowDock && <AnimatePresence mode="wait" custom={dir}>
            <RightPanelTabBoundary key={tab} tab={tab}>
              {renderedTab === "ai" && (
                <motion.div key="ai-chat" variants={variants} initial="initial" animate="animate" exit="exit" className="h-full">
                  <ChatPanel chatContext={chatContext} />
                </motion.div>
              )}
              {renderedTab === "video" && (
                <motion.div key="video" variants={variants} initial="initial" animate="animate" exit="exit" className="h-full">
                  <VideoTab />
                </motion.div>
              )}
              {renderedTab === "interactive" && (
                <motion.div key="interactive" variants={variants} initial="initial" animate="animate" exit="exit" className="h-full">
                  <InteractiveTab />
                </motion.div>
              )}
              {renderedTab === "browser" && (
                <motion.div key="browser" variants={variants} initial="initial" animate="animate" exit="exit" className="h-full">
                  <BrowserTab />
                </motion.div>
              )}
            </RightPanelTabBoundary>
          </AnimatePresence>}
        </div>
      </div>
    </div>
  );
}
