"use client";

import { useEffect } from "react";
import { NOTES_PANEL_ID, RIGHT_PANEL_ID, resolveFullscreenRect, type FullscreenTarget } from "@/lib/constants/layout";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

/**
 * 全屏期间跟随目标矩形（默认笔记栏）。
 * `viewport` 跟随视口；`notes` 跟随 `#notes-panel`（含右侧 AI 开合导致的栏宽变化）。
 */
export function useFullscreenTrack(
  windowId: string,
  enabled: boolean,
  target: FullscreenTarget = "notes",
) {
  useEffect(() => {
    if (!enabled || !windowId) return;

    const sync = () => {
      const rect = resolveFullscreenRect(target);
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      useWindowManager.getState().commitGeometry(windowId, {
        pos: { x: rect.left, y: rect.top },
        size: { width: rect.width, height: rect.height },
      });
    };

    sync();
    window.addEventListener("resize", sync);
    const panelIds = [
      target === "notes" ? NOTES_PANEL_ID : null,
      target === "right" ? RIGHT_PANEL_ID : null,
    ].filter(Boolean) as string[];
    const observer =
      panelIds.length > 0 && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    for (const id of panelIds) {
      const panel = document.getElementById(id);
      if (panel) observer?.observe(panel);
    }

    return () => {
      window.removeEventListener("resize", sync);
      observer?.disconnect();
    };
  }, [enabled, windowId, target]);
}
