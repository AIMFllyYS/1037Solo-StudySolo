"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AgentConversationSidebar from "./AgentConversationSidebar";
import AgentPanelResizeHandle from "./AgentPanelResizeHandle";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useStore } from "@/lib/stores/ui";
import { useIsMobile } from "@/lib/hooks/layout/useIsMobile";
import { useAgentChatContext } from "@/lib/hooks/chat/useAgentChatContext";
import { useAgentPanelSizes } from "@/lib/hooks/layout/useAgentPanelSizes";
import { AGENT_CENTER_MIN_PX } from "@/lib/layout/agentPanelSizes";
import { ResizeSkeleton, resizeVariantForAgentPath } from "@/components/shared/ResizeLoader";
import { useAgentDockPerSession } from "@/lib/hooks/layout/useAgentDockPerSession";

/** 左对话栏与中央路由插槽：像素宽度直接来自全局布局状态，右栏开合无需补偿回写。 */
export default function AgentShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const chatContext = useAgentChatContext();
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useStore((state) => state.setSidebarCollapsed);
  const sizes = useAgentPanelSizes();
  useAgentDockPerSession();

  useLayoutEffect(() => {
    if (isMobile) return;
    document.documentElement.style.setProperty("--agent-left-width", `${sizes.left}px`);
  }, [sizes.left, isMobile]);
  useEffect(() => () => { document.documentElement.style.removeProperty("--agent-left-width"); }, []);

  // 只观测中央正文的实际重排用于加载提示，不参与任何列的宽度计算。
  const mainRef = useRef<HTMLDivElement>(null);
  const [centerResizing, setCenterResizing] = useState(false);
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    let width = main.getBoundingClientRect().width;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      const next = main.getBoundingClientRect().width;
      if (Math.abs(next - width) < 1) return;
      width = next;
      setCenterResizing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCenterResizing(false), 160);
    });
    observer.observe(main);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  const center = <div ref={mainRef} id={NOTES_PANEL_ID} data-agent-slot="main" className="relative h-full min-h-0 min-w-0 overflow-visible">
    {children}
    {centerResizing ? <ResizeSkeleton variant={resizeVariantForAgentPath(pathname)} /> : null}
  </div>;
  if (isMobile) return <div className="h-full min-h-0 min-w-0" data-agent-workspace>{center}</div>;

  return <div className="flex h-full min-h-0 min-w-0" data-agent-workspace data-panel-group>
    <aside
      data-panel-id="agent-conversations"
      data-agent-slot="conversations"
      data-agent-sidebar-container
      data-collapsed={sidebarCollapsed || undefined}
      aria-hidden={sidebarCollapsed || undefined}
      inert={sidebarCollapsed || undefined}
      className="relative h-full min-h-0 shrink-0 overflow-hidden"
      style={{ flexBasis: sizes.left, width: sizes.left, "--agent-left-content-width": `${sizes.preferred.left}px` } as React.CSSProperties}
    >
      <div className="h-full" style={{ width: "var(--agent-left-content-width, 100%)" }}><AgentConversationSidebar chatContext={chatContext} /></div>
    </aside>
    <AgentPanelResizeHandle
      side="left"
      value={sizes.left}
      min={200}
      max={Math.min(520, sizes.viewport - sizes.right - AGENT_CENTER_MIN_PX)}
      onResize={(pixels) => { sizes.setSize("left", pixels); if (sidebarCollapsed) setSidebarCollapsed(false); }}
      onCollapse={() => setSidebarCollapsed(true)}
    />
    <div data-panel-id="agent-main" className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">{center}</div>
  </div>;
}
