"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { FileText, MonitorPlay, Hand, Globe, X, Lightbulb, ClipboardCheck, PanelTopClose, PanelTopOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useStore, type CenterTab } from "@/lib/stores/ui";
import { useSettings } from "@/lib/hooks/useSettings";
import { resolveRouteLayout } from "@/lib/content/routeLayout";
import { useIsClient } from "@/lib/hooks/useIsClient";
import { useBrowser, BROWSE_TAB } from "@/lib/hooks/useBrowser";
import { useUiReducedMotion as useReducedMotion } from "@/lib/hooks/useUiReducedMotion";
import { LAYOUT_REFLOW } from "@/lib/motion";
import { useContentTabs, type ContentTabId } from "@/lib/stores/contentTabs";
import BrowserSettingsButton from "@/components/browser/BrowserSettingsButton";
import GlobalSearchButton from "@/components/search/GlobalSearchButton";
import WindowTaskbar from "@/components/window/WindowTaskbar";
import { CenterTabsHostContext } from "./centerTabsHost";
import { useT } from "@/lib/i18n";
import { PanelSkeleton } from "@/components/shared/LoadingStates";

const CONTENT_TAB_ICONS: Record<ContentTabId, React.ReactNode> = {
  content: <FileText size={15} />,
  examples: <Lightbulb size={15} />,
  quiz: <ClipboardCheck size={15} />,
};

// 阅读型内容按需挂载：只有切到该 tab 时才拉进对应本体，笔记（children）永远挂着不卸载。
const VideoTab = dynamic(() => import("@/components/video/VideoTab"), {
  ssr: false,
  loading: () => <CenterTabLoading />,
});
const InteractiveTab = dynamic(() => import("@/components/interactives/InteractiveTab"), {
  ssr: false,
  loading: () => <CenterTabLoading />,
});
const BrowserTab = dynamic(() => import("@/components/browser/BrowserTab"), {
  ssr: false,
  loading: () => <CenterTabLoading />,
});

function CenterTabLoading() {
  return <PanelSkeleton variant="document" />;
}

/**
 * 中间「笔记展示区」外壳：在正文上方挂一条 Tab 栏，把「视频 / 可交互 / 浏览器」这些
 * 阅读型内容从右栏搬到这里——它们和笔记争的是同一块阅读宽度，理应在中间切换。
 *
 * - 笔记（children）**永不卸载**，只被隐藏，切回来时滚动位置与 DOM 状态都在；
 * - 视频 / 可交互 / 浏览器按需挂载（首次切到才 import 本体），一旦挂上也保持挂载，
 *   避免来回切标签反复重建播放器 / iframe；
 * - 只有当前路由允许某媒体 tab 时才渲染它的按钮（可用性沿用 routeLayout.rightTabs）。
 */
export default function CenterWorkspace({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const routeLayout = useMemo(() => resolveRouteLayout(pathname), [pathname]);
  const storeRightTabs = useStore((s) => s.rightTabs);
  const rightTabs = routeLayout.route ? routeLayout.rightTabs : storeRightTabs;

  const centerTab = useStore((s) => s.centerTab);
  const setCenterTab = useStore((s) => s.setCenterTab);

  const bookmarks = useBrowser((s) => s.bookmarks);
  const activeTabId = useBrowser((s) => s.activeTabId);
  const openBrowse = useBrowser((s) => s.openBrowse);
  const openBookmark = useBrowser((s) => s.openBookmark);
  const removeBookmark = useBrowser((s) => s.removeBookmark);
  const mounted = useIsClient();
  const safeBookmarks = mounted ? bookmarks : [];

  const mediaTabs = useMemo(
    () =>
      (
        [
          { id: "video", labelKey: "panel.rightTab.video", icon: <MonitorPlay size={15} /> },
          { id: "interactive", labelKey: "panel.rightTab.interactive", icon: <Hand size={15} /> },
          { id: "browser", labelKey: "panel.rightTab.browser", icon: <Globe size={15} /> },
        ] as const
      ).filter((item) => rightTabs.includes(item.id)),
    [rightTabs],
  );

  const showBrowser = rightTabs.includes("browser");
  // 没有任何媒体 tab（reference / article 档位）：不挂 tab 栏，中间就是纯笔记，版式与改造前一致。
  const showTabBar = mediaTabs.length > 0;

  // 当前 centerTab 不在允许列表时回落到笔记（换路由后媒体 tab 可能消失）。
  const activeTab: CenterTab =
    centerTab === "notes" || rightTabs.includes(centerTab as (typeof rightTabs)[number]) ? centerTab : "notes";
  useEffect(() => {
    if (activeTab !== centerTab) setCenterTab("notes");
  }, [activeTab, centerTab, setCenterTab]);

  // 记录哪些媒体 tab 已经被访问过 → 决定是否挂载其本体（懒挂载 + 挂载后保留）。
  // 采用 React 官方「渲染期根据派生值调整 state」模式：activeTab 是媒体 tab 且尚未记录时，
  // 在渲染中直接 setState（React 会立刻重渲染并合并），避免 effect 里 setState 的级联渲染告警。
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({});
  if (activeTab !== "notes" && !mountedTabs[activeTab]) {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }

  const switchTo = (next: CenterTab) => {
    setCenterTab(next);
    if (next === "browser") openBrowse();
  };

  // 内容页（正文 / 例题 / 题目测试）注册进来的标签：和媒体标签合成同一条栏。
  const contentTabs = useContentTabs((s) => s.tabs);
  const contentActive = useContentTabs((s) => s.active);
  const setContentActive = useContentTabs((s) => s.setActive);
  const onContentPage = contentTabs.length > 0;
  const showContentButtons = contentTabs.length > 1 || (onContentPage && mediaTabs.length > 0);
  const topBarCollapsed = useStore((s) => s.topBarCollapsed);
  const toggleTopBar = useStore((s) => s.toggleTopBar);
  const reducedMotion = useReducedMotion();
  const barVisible = showTabBar || onContentPage;

  // 自动隐藏：栏默认收在顶部之外，鼠标碰到顶部热区 / 键盘聚焦进栏才滑出；触屏没有 hover，始终常驻。
  const autoHideSetting = useSettings((s) => s.centerTabsAutoHide);
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(hover: none)");
    if (!query) return;
    const sync = () => setCoarse(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  const autoHide = autoHideSetting && !coarse;
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setRevealed(true);
  }, []);
  const hideSoon = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), 260);
  }, []);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  const barShown = !autoHide || revealed;

  /** 同一条栏里所有标签共用一个选中底：切换时底色滑到新标签（与右栏 Agent 标签同一手感）。 */
  const tabButton = (key: string, active: boolean, onClick: () => void, icon: React.ReactNode, label: string, testId: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={clsx(
        "press relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--duration-fast)]",
        active ? "text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
      )}
    >
      {active && (
        <motion.span
          layoutId={reducedMotion ? undefined : "center-tab-active"}
          transition={LAYOUT_REFLOW}
          className="absolute inset-0 z-0 rounded-lg bg-[var(--accent-weak)]"
          aria-hidden
        />
      )}
      <span className="relative z-[1] flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );

  return (
    <CenterTabsHostContext.Provider value={true}>
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      {barVisible && autoHide && (
        <div
          aria-hidden
          data-testid="center-tabs-hotzone"
          className="absolute inset-x-0 top-0 z-20 h-2"
          onMouseEnter={reveal}
        />
      )}
      {barVisible && (
        <div
          role="tablist"
          aria-label={t("panel.centerTab.aria")}
          data-testid="center-tabs"
          data-auto-hide={autoHide ? (barShown ? "shown" : "hidden") : undefined}
          onMouseEnter={autoHide ? reveal : undefined}
          onMouseLeave={autoHide ? hideSoon : undefined}
          onFocusCapture={autoHide ? reveal : undefined}
          onBlurCapture={autoHide ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hideSoon(); } : undefined}
          className={clsx(
            "flex h-11 items-center gap-1 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-1.5",
            autoHide
              ? "center-tabs-floating absolute inset-x-0 top-0 z-30 shadow-[0_6px_18px_color-mix(in_srgb,var(--ink)_10%,transparent)]"
              : "shrink-0",
          )}
          style={autoHide ? { transform: barShown ? "translateY(0)" : "translateY(-100%)", pointerEvents: barShown ? "auto" : "none" } : undefined}
        >
          <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {onContentPage
              ? showContentButtons &&
                contentTabs.map((tab) =>
                  tabButton(
                    tab.id,
                    activeTab === "notes" && contentActive === tab.id,
                    () => {
                      setContentActive(tab.id);
                      switchTo("notes");
                    },
                    CONTENT_TAB_ICONS[tab.id],
                    tab.label,
                    `center-tab-${tab.id}`,
                  ),
                )
              : tabButton("notes", activeTab === "notes", () => switchTo("notes"), <FileText size={15} />, t("panel.centerTab.notes"), "center-tab-notes")}

            {mediaTabs.map((item) =>
              tabButton(
                item.id,
                item.id === "browser" ? activeTab === "browser" && activeTabId === BROWSE_TAB : activeTab === item.id,
                () => switchTo(item.id),
                item.icon,
                t(item.labelKey),
                `center-tab-${item.id}`,
              ),
            )}

            {/* 浏览器收藏夹标签：独立固定标签，与右栏原逻辑一致，只是落点换到中间。 */}
            {showBrowser && safeBookmarks.length > 0 && (
              <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--line-soft)]" aria-hidden />
            )}
            {showBrowser &&
              safeBookmarks.map((bm) => {
                const active = activeTab === "browser" && activeTabId === bm.id;
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
                        switchTo("browser");
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
          {showBrowser && <BrowserSettingsButton onAdded={() => switchTo("browser")} />}
          {/* 内容页原来自带的一条栏里的右侧工具（顶栏收起时的搜索/任务栏、收起顶栏）并到这里。 */}
          {onContentPage && topBarCollapsed && (
            <div className="flex min-w-0 shrink items-center gap-1 border-l border-[var(--line-soft)] pl-1.5">
              <GlobalSearchButton />
              <WindowTaskbar host="content-tab" />
            </div>
          )}
          {onContentPage && (
            <button
              type="button"
              onClick={toggleTopBar}
              title={t(topBarCollapsed ? "panel.centerTab.expandTopBar" : "panel.centerTab.collapseTopBar")}
              aria-label={t(topBarCollapsed ? "panel.centerTab.expandTopBar" : "panel.centerTab.collapseTopBar")}
              aria-pressed={topBarCollapsed}
              className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
            >
              {topBarCollapsed ? <PanelTopOpen size={17} /> : <PanelTopClose size={17} />}
            </button>
          )}
        </div>
      )}

      {/* 内容区：笔记常驻（只隐藏），媒体懒挂载后保留。 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={clsx("h-full min-h-0 w-full", activeTab !== "notes" && "invisible pointer-events-none absolute inset-0")}
        >
          {children}
        </div>

        {mountedTabs.video && (
          <div className={clsx("absolute inset-0 min-h-0", activeTab !== "video" && "invisible pointer-events-none")} aria-hidden={activeTab !== "video"}>
            <VideoTab />
          </div>
        )}
        {mountedTabs.interactive && (
          <div className={clsx("absolute inset-0 min-h-0", activeTab !== "interactive" && "invisible pointer-events-none")} aria-hidden={activeTab !== "interactive"}>
            <InteractiveTab />
          </div>
        )}
        {mountedTabs.browser && (
          <div className={clsx("absolute inset-0 min-h-0", activeTab !== "browser" && "invisible pointer-events-none")} aria-hidden={activeTab !== "browser"}>
            <BrowserTab />
          </div>
        )}
      </div>
    </div>
    </CenterTabsHostContext.Provider>
  );
}
