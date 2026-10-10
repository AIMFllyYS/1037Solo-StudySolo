import clsx from "clsx";
import { PanelTopClose, PanelTopOpen, PanelRightOpen, Maximize, Minimize } from "lucide-react";
import { useStore } from "@/lib/stores/ui";

import { getSubject, getCategory, getContentItem } from "@/lib/content-data";

import type { SubjectId } from "@/lib/types/content";

import { useBrowserFullscreen } from "@/lib/hooks/runtime/useBrowserFullscreen";

import ModeSwitcher from "../navigation/ModeSwitcher";
import { AgentCenterTabsLive } from "@/components/agent/AgentCenterTabs";
import { useT } from "@/lib/i18n";

import WindowTaskbar from "@/components/window/WindowTaskbar";
import GlobalSearchButton from "@/components/search/GlobalSearchButton";

import { formatShortcut } from "@/lib/keyboard/format";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";

import ShareButton from "@/components/share/ShareButton";
import SourcesPanelToggle from "@/components/agent/SourcesPanelToggle";

export default function TopBar({
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
        barCollapsed ? "h-0 border-b-0 py-0" : "ss-chrome h-12",
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
