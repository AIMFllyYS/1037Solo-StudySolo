"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import AgentConversationSidebar from "./AgentConversationSidebar";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useStore } from "@/lib/stores/ui";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { useAgentChatContext } from "@/lib/hooks/useAgentChatContext";
import { PANEL_PRESETS, nestedShares } from "@/lib/constants/panelPresets";
import { ResizeSkeleton, resizeVariantForAgentPath } from "@/components/shared/ResizeLoader";
import { useAgentDockPerSession } from "@/lib/hooks/useAgentDockPerSession";
import { agentLeftPercentForPx, loadAgentLeftPx, saveAgentLeftPx } from "@/lib/layout/agentLeftWidth";

/**
 * Agent 段外壳（挂在 `app/agent/layout.tsx`）：「左侧对话栏 + 中央内容插槽」。
 *
 * 左栏放在**布局层**而不是页面里：切到 /agent/assets、/agent/scheduled 这些子页时左栏要原样留着，
 * 只有中央区换内容（子路由的 children）。右侧工作区是顶层布局里独立的一列（见 AppShell / AgentDockColumn），
 * 因为它要通到窗口最顶、与顶栏平齐，不能放在顶栏下面。
 *
 * `#notes-panel` 挂在中央这一块上：窗口全屏（fullscreenTarget="notes"）要量它，
 * 而且资产页等子路由也照样要有这个锚点，所以不能塞进对话组件内部。
 */
export default function AgentShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const chatContext = useAgentChatContext();
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);

  // 右栏跟着对话走：切会话恢复各自的展开状态与内容，非对话页（资产等）默认收起。
  useAgentDockPerSession();

  // 「全局」模式要把中央对话压到 0、让右侧工作区铺满剩余宽度，这需要左栏当前宽度。
  // 变量挂在 <html> 上：消费方是外层 shell 的分栏面板（AgentShell 的祖先），
  // 挂在本地节点上它读不到。这里只交出宽度数字，不做业务逻辑上的 DOM 测量。
  const conversationsRef = useRef<HTMLElement>(null);
  /** 用户最后一次拖到的「舒适」左栏宽度（像素）；吸附收起再展开时回到它。 */
  const lastWideWidthRef = useRef(0);
  /** 拖拽左栏分隔线期间：盖一层骨架，避免文件夹树被压成竖排单字。 */
  const [leftDragging, setLeftDragging] = useState(false);
  useEffect(() => {
    const left = conversationsRef.current;
    if (!left || typeof document === "undefined" || typeof ResizeObserver === "undefined") return;
    const rootStyle = document.documentElement.style;
    const sync = () => {
      const width = left.getBoundingClientRect().width;
      // 记住用户最后一次「舒适」的左栏宽度：吸附收起后再展开要回到这里，而不是回到吸附点。
      // 两种时候都不记录：拖拽途中（会把好值覆盖成吸附点附近的宽度）、以及正在收起时
      // （收起动画逐帧变窄，记下来就等于把「冻结宽度」本身越缩越小）。
      if (!leftDragging && !sidebarCollapsed && width >= 80) lastWideWidthRef.current = width;
      // 内容宽度**永不小于**最近一次舒适宽度：面板被拖窄/正在收起的那些帧里，
      // 里面的文字不再跟着重排，只有面板本身真实变窄（外层 overflow-hidden 裁掉多余部分）。
      const contentWidth = Math.max(Math.round(width), Math.round(lastWideWidthRef.current));
      left.style.setProperty("--agent-left-content-width", `${contentWidth}px`);
      // 全局态下左栏宽度正是由这个变量驱动出来的，再回写会把瞬时值锁死（越收越窄）。
      if (useAgentDockRuntime.getState().dockGlobal) return;
      rootStyle.setProperty("--agent-left-width", `${Math.round(width)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(left);
    return () => {
      // 只断开观测：这个 effect 会因为拖拽/收起重建，而重建后的 sync() 在右栏全局态下
      // 会提前 return（见上面那行）。在这里摘变量 = 全局态下切一次侧栏宽度就永久回落到
      // CSS 兜底的 15rem —— 摘变量挪到下面那个「真正卸载外壳」的 effect。
      observer.disconnect();
    };
    // leftDragging 进依赖：拖拽中不记录舒适宽度，所以观测器要跟着这个状态重建。
  }, [sidebarCollapsed, leftDragging]);

  // 卸载整个 Agent 外壳时才摘掉 --agent-left-width（<html> 上的变量不该留给别的页面）。
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--agent-left-width");
    },
    [],
  );

  /**
   * 被压到 minSize 以下时，分栏库会吸附到彻底收起。这一段交接要**很快**
   * （用户口径：收起时的软动画要快），所以临时把缓动切到 --duration-normal。
   */
  const [snapping, setSnapping] = useState(false);
  const snapTimerRef = useRef<number | null>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);

  /**
   * 左栏「像素锚定」（修复：调好左栏后再拖右侧面板，左栏跟着动）。
   * 根因见 lib/layout/agentLeftWidth.ts：左栏存的是嵌套组内的百分比，嵌套组宽度 = 窗口 − 右栏，
   * 右栏一动，同一个百分比对应的像素就变。现在以像素为准：嵌套组宽度变化时把像素重新换算成百分比写回。
   */
  const groupRef = useRef<HTMLDivElement>(null);
  const leftPxRef = useRef<number | null>(null);
  const leftDraggingRef = useRef(false);
  const applyLeftPx = useCallback(() => {
    const group = groupRef.current;
    const panel = leftPanelRef.current;
    if (!group || !panel || leftDraggingRef.current) return;
    const width = group.getBoundingClientRect().width;
    if (width <= 0) return;
    if (leftPxRef.current === null) leftPxRef.current = loadAgentLeftPx(window.innerWidth);
    try {
      if (panel.isCollapsed() || useStore.getState().sidebarCollapsed) return;
      const pct = agentLeftPercentForPx(leftPxRef.current, width);
      if (pct === null || Math.abs(panel.getSize() - pct) < 0.05) return;
      panel.resize(pct);
    } catch {
      // 首帧（或 jsdom）还没有布局信息，忽略
    }
  }, []);
  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applyLeftPx());
    observer.observe(group);
    applyLeftPx();
    return () => observer.disconnect();
  }, [applyLeftPx, isMobile]);
  const commitLeftPx = useCallback(() => {
    const left = conversationsRef.current;
    if (!left) return;
    const px = left.getBoundingClientRect().width;
    if (px < 80) return;
    leftPxRef.current = px;
    saveAgentLeftPx(px);
  }, []);
  const pendingLeftSyncRef = useRef<boolean | null>(null);
  // 收起**不再卸载面板**：分栏库要留着这个面板，才能在展开时还原用户上次拖到的宽度。
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    try {
      if (sidebarCollapsed && !panel.isCollapsed()) { pendingLeftSyncRef.current = true; panel.collapse(); }
      if (!sidebarCollapsed && panel.isCollapsed()) { pendingLeftSyncRef.current = false; panel.expand(); window.requestAnimationFrame(applyLeftPx); }
    } catch {
      pendingLeftSyncRef.current = null;
      // 首帧（或 jsdom）还没有布局信息，分栏库会抛「Panel size not found」，忽略即可
    }
  }, [sidebarCollapsed, applyLeftPx]);

  // The panel library owns saved sizes and expandToSizes. Do not resize again
  // from a pixel snapshot: that overwrote the user's saved ratio after resize.

  const handleAutoCollapse = useCallback(() => {
    setSnapping(true);
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      setSnapping(false);
    }, 320);
    setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);
  useEffect(() => () => {
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
  }, []);

  /**
   * 中央面板的宽度正在变化（真全屏切换、拖分隔线、改窗口大小、切子路由）→ 盖一层骨架屏。
   * 宽度一变，正文就会重新折行、文字自动异位，很难看；盖住既避免视觉跳动，
   * 也把这段每帧重排的开销省掉（骨架只跑 transform/opacity）。
   */
  const mainRef = useRef<HTMLDivElement>(null);
  const [centerResizing, setCenterResizing] = useState(false);
  const centerBusyTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width;
      if (Math.abs(width - lastWidth) < 1) return;
      lastWidth = width;
      setCenterResizing(true);
      if (centerBusyTimerRef.current !== null) window.clearTimeout(centerBusyTimerRef.current);
      centerBusyTimerRef.current = window.setTimeout(() => {
        centerBusyTimerRef.current = null;
        setCenterResizing(false);
      }, 260);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (centerBusyTimerRef.current !== null) window.clearTimeout(centerBusyTimerRef.current);
    };
  }, []);

  const center = (
    <div
      ref={mainRef}
      id={NOTES_PANEL_ID}
      data-agent-slot="main"
      className="relative h-full min-h-0 min-w-0 overflow-visible"
    >
      {children}
      {centerResizing && <ResizeSkeleton variant={resizeVariantForAgentPath(pathname)} />}
      {/* 展开入口只有顶栏那一个（LOGO 左侧，与 Studio 同款）。这里**不再**浮任何按钮：
          悬浮块会压住正文，而且和顶栏那个开关是同一个功能、两套图标。 */}
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-full min-h-0 min-w-0" data-agent-workspace>
        {center}
      </div>
    );
  }

  return (
    <div ref={groupRef} className="h-full min-h-0" data-agent-workspace>
      {/* v3 applies the new 35/65 default without removing the existing v2 user layout. */}
      <PanelGroup direction="horizontal" autoSaveId="studysolo-agent-layout-v3" data-pane-snap={snapping || undefined}>
        <Panel
          ref={leftPanelRef}
          id="agent-conversations"
          order={1}
          defaultSize={sidebarCollapsed ? 0 : nestedShares(PANEL_PRESETS.agent).left}
          minSize={14}
          collapsible
          collapsedSize={0}
          maxSize={40}
          onResize={(size, previousSize) => {
            const collapsed = size === 0;
            if (previousSize === undefined) {
              queueMicrotask(() => {
                const panel = leftPanelRef.current;
                if (!panel) return;
                try {
                  const wanted = useStore.getState().sidebarCollapsed;
                  if (panel.isCollapsed() === wanted) { pendingLeftSyncRef.current = null; return; }
                  pendingLeftSyncRef.current = wanted;
                  if (wanted) panel.collapse();
                  else panel.expand();
                } catch { pendingLeftSyncRef.current = null; }
              });
              return;
            }
            if (pendingLeftSyncRef.current !== null) {
              if (collapsed === pendingLeftSyncRef.current) pendingLeftSyncRef.current = null;
              return;
            }
            if (collapsed === (previousSize === 0)) return;
            if (collapsed) handleAutoCollapse();
            else setSidebarCollapsed(false);
          }}
        >
          <aside
            ref={conversationsRef}
            data-agent-slot="conversations"
            data-agent-sidebar-container
            data-collapsed={sidebarCollapsed || undefined}
            // overflow-hidden + 内容定宽（--agent-left-content-width）：收起时把左栏裁成一条缝，
            // 内容不重排、不缩放；也正因此不再需要拖拽期的骨架屏遮挡。
            className="relative h-full min-h-0 overflow-hidden"
          >
            <div className="h-full" style={{ width: "var(--agent-left-content-width, 100%)" }}>
              <AgentConversationSidebar chatContext={chatContext} />
            </div>
          </aside>
        </Panel>
        <PanelResizeHandle
          onDragging={(dragging) => {
            leftDraggingRef.current = dragging;
            setLeftDragging(dragging);
            if (!dragging) commitLeftPx();
          }}
          className="group relative w-px bg-[var(--line-soft)] outline-none data-[resize-handle-state=drag]:bg-[var(--accent)]"
        >
          <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
        </PanelResizeHandle>
        <Panel id="agent-main" order={2} defaultSize={sidebarCollapsed ? 100 : nestedShares(PANEL_PRESETS.agent).center} minSize={32}>
          {center}
        </Panel>
      </PanelGroup>
    </div>
  );
}
