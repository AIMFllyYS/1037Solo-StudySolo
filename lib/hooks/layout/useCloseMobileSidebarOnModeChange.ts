"use client";

import { useLayoutEffect, useRef } from "react";
import { useStore } from "@/lib/stores/ui";

/** Close a mode-owned mobile drawer before a new mode or viewport shell paints. */
export function useCloseMobileSidebarOnModeChange(mode: string, isMobile: boolean): void {
  const setMobileSidebarOpen = useStore((state) => state.setMobileSidebarOpen);
  const previous = useRef({ mode, isMobile });

  useLayoutEffect(() => {
    if (previous.current.mode === mode && previous.current.isMobile === isMobile) return;
    previous.current = { mode, isMobile };
    setMobileSidebarOpen(false);
  }, [isMobile, mode, setMobileSidebarOpen]);
}
