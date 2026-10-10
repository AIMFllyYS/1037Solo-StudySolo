"use client";

import { useLayoutEffect, useState } from "react";
import { useStore } from "@/lib/stores/ui";
import { defaultAgentPanelSizes, fitAgentPanelSizes, readAgentPanelSizes } from "@/lib/layout/agentPanelSizes";

/** 窗口变化只收敛可见几何，左右列从同一个 store 直接获得像素宽度。 */
export function useAgentPanelSizes() {
  const sizes = useStore((state) => state.agentPanelSizes);
  const leftCollapsed = useStore((state) => state.sidebarCollapsed);
  const rightCollapsed = useStore((state) => state.agentDockCollapsed);
  const setSize = useStore((state) => state.setAgentPanelSize);
  const [viewport, setViewport] = useState(1440);
  useLayoutEffect(() => {
    if (!useStore.getState().agentPanelSizes) useStore.setState({ agentPanelSizes: readAgentPanelSizes(window.innerWidth) });
    const sync = () => setViewport(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  const preferred = sizes ?? defaultAgentPanelSizes(viewport);
  const visible = fitAgentPanelSizes(preferred, viewport, leftCollapsed, rightCollapsed);
  return { ...visible, preferred, viewport, setSize };
}
