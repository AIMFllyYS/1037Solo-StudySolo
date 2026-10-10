import { resolveFullscreenRect, type FullscreenTarget } from "@/lib/constants/layout";
import { useWindowManager, type WindowPoint, type WindowSize } from "@/lib/stores/workspace/windowManager";
import { useSettings } from "@/lib/stores/settings";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";

function defaultTargetFor(win: ManagedWindow): FullscreenTarget {
  if (win.type === "billing-dashboard") return "viewport";
  if (win.type === "artifact-viewer") return useSettings.getState().artifactFullscreenTarget;
  return "notes";
}

/**
 * 红绿灯与键盘快捷键共用：记下还原几何，再按 fullscreenTarget 铺满。
 * `preExpand` 存在窗口记录上，避免 hook ref 与快捷键各记一份。
 *
 * Agent 右栏不走这里：dock 窗口的「扩展」由 `AgentDockHost` 的面板几何负责
 * （见 `useManagedWindowChrome.toggleFullscreen`），所以本函数只在浮窗形态下被调用。
 */
export function toggleManagedWindowFullscreen(windowId: string, target?: FullscreenTarget): void {
  const wm = useWindowManager.getState();
  const current = wm.windows.find((win) => win.id === windowId);
  if (!current) return;

  if (current.fullscreen) {
    const snap = current.preExpand;
    if (snap) wm.commitGeometry(windowId, { pos: snap.pos, size: snap.size });
    wm.updateWindow(windowId, { preExpand: null });
    wm.setFullscreen(windowId, false);
    return;
  }

  const resolved = target ?? defaultTargetFor(current);
  wm.updateWindow(windowId, {
    preExpand: { pos: current.pos, size: current.size } satisfies { pos: WindowPoint; size: WindowSize },
  });
  const rect = resolveFullscreenRect(resolved);
  if (rect && rect.width > 0 && rect.height > 0) {
    wm.commitGeometry(windowId, {
      pos: { x: rect.left, y: rect.top },
      size: { width: rect.width, height: rect.height },
    });
  }
  wm.setFullscreen(windowId, true);
}
