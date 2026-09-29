"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { FileText, MonitorPlay, Hand, Globe, X } from "lucide-react";
import { useStore, type CenterTab } from "@/lib/stores/ui";
import { resolveRouteLayout } from "@/lib/content/routeLayout";
import { useIsClient } from "@/lib/hooks/useIsClient";
import { useBrowser, BROWSE_TAB } from "@/lib/hooks/useBrowser";
import BrowserSettingsButton from "@/components/browser/BrowserSettingsButton";
import { useT } from "@/lib/i18n";

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
  return (
    <div className="flex h-full flex-col gap-3 px-4 py-5" role="status">
      <div className="h-4 w-24 animate-shimmer rounded bg-[var(--bg-muted)]" />
      <div className="h-28 animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
      <div className="h-16 animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
    </div>
  );
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

  const tabBtnCls = (active: boolean) =>
    clsx(
      "press flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
      active
        ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
        : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {showTabBar && (
        <div
          role="tablist"
          aria-label={t("panel.centerTab.aria")}
          data-testid="center-tabs"
          className="flex shrink-0 items-center gap-1 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-1.5 py-1.5"
        >
          <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "notes"}
              data-testid="center-tab-notes"
              onClick={() => switchTo("notes")}
              className={tabBtnCls(activeTab === "notes")}
            >
              <FileText size={15} />
              {t("panel.centerTab.notes")}
            </button>

            {mediaTabs.map((item) => {
              const active =
                item.id === "browser"
                  ? activeTab === "browser" && activeTabId === BROWSE_TAB
                  : activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === item.id}
                  data-testid={`center-tab-${item.id}`}
                  onClick={() => switchTo(item.id)}
                  className={tabBtnCls(active)}
                >
                  {item.icon}
                  {t(item.labelKey)}
                </button>
              );
            })}

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
  );
}
