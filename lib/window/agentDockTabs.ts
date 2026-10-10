import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";

export const AGENT_DOCK_VISIBLE_TAB_LIMIT = 3;

/** Keep the active window reachable and order remaining windows by their last activation z-index. */
export function orderAgentDockWindows(
  windows: ManagedWindow[],
  activeWindowId: string | null,
): ManagedWindow[] {
  const active = activeWindowId ? windows.find((window) => window.id === activeWindowId) : undefined;
  const remaining = windows.filter((window) => window.id !== active?.id).slice().sort((a, b) => b.z - a.z);
  return active ? [active, ...remaining] : remaining;
}

export function splitAgentDockWindows(
  windows: ManagedWindow[],
  activeWindowId: string | null,
  limit = AGENT_DOCK_VISIBLE_TAB_LIMIT,
): { visible: ManagedWindow[]; overflow: ManagedWindow[] } {
  const ordered = orderAgentDockWindows(windows, activeWindowId);
  const safeLimit = Math.max(0, Math.floor(limit));
  return {
    visible: ordered.slice(0, safeLimit),
    overflow: ordered.slice(safeLimit),
  };
}
