import { PANEL_PRESETS } from "@/lib/constants/panelPresets";
import { AGENT_LEFT_PX_KEY, clampAgentLeftPx, defaultAgentLeftPx } from "./agentLeftWidth";

export const AGENT_PANEL_SIZES_KEY = "studysolo-agent-panel-sizes-v1";
export const AGENT_CENTER_MIN_PX = 160;
export interface AgentPanelSizes { left: number; right: number }
interface StorageReader { getItem: (key: string) => string | null }
function browserStorage(): StorageReader | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

export function defaultAgentPanelSizes(viewport: number): AgentPanelSizes {
  return { left: defaultAgentLeftPx(viewport), right: Math.round(viewport * PANEL_PRESETS.agent.rightExpanded / 100) };
}

function legacySize(storage: StorageReader, key: string, panelId: string, index: number): number | null {
  try {
    const data = JSON.parse(storage.getItem(`react-resizable-panels:${key}`) ?? "null") as Record<string, { layout?: unknown[]; expandToSizes?: Record<string, unknown> }> | null;
    const state = Object.entries(data ?? {}).find(([id]) => id.split(",").includes(panelId))?.[1];
    const saved = state?.layout?.[index];
    const expanded = state?.expandToSizes?.[panelId];
    const value = typeof saved === "number" && saved > 0 ? saved : expanded;
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
  } catch { return null; }
}

/** 一次性兼容像素左栏及分栏库旧比例；新记录同时保存左右尺寸，不删除旧记录。 */
export function readAgentPanelSizes(viewport: number, storage: StorageReader | undefined = browserStorage()): AgentPanelSizes {
  const defaults = defaultAgentPanelSizes(viewport);
  if (!storage) return defaults;
  try {
    const saved = JSON.parse(storage.getItem(AGENT_PANEL_SIZES_KEY) ?? "null") as AgentPanelSizes | null;
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.right) && saved.left > 0 && saved.right > 0) return { left: clampAgentLeftPx(saved.left), right: Math.max(240, Math.round(saved.right)) };
    const rightPercent = legacySize(storage, "studysolo-agent-shell-v2", "agent-shell-dock", 1) ?? PANEL_PRESETS.agent.rightExpanded;
    const right = Math.round(viewport * rightPercent / 100);
    const rawLeft = storage.getItem(AGENT_LEFT_PX_KEY);
    const storedLeft = rawLeft === null ? NaN : Number(rawLeft);
    const leftPercent = legacySize(storage, "studysolo-agent-layout-v3", "agent-conversations", 0);
    const left = Number.isFinite(storedLeft) && storedLeft > 0 ? storedLeft : leftPercent === null ? defaults.left : (viewport - right) * leftPercent / 100;
    return { left: clampAgentLeftPx(left), right: Math.max(240, right) };
  } catch { return defaults; }
}

export function writeAgentPanelSizes(sizes: AgentPanelSizes): void {
  try { localStorage.setItem(AGENT_PANEL_SIZES_KEY, JSON.stringify(sizes)); } catch { /* 隐私模式保持内存状态 */ }
}

/** 只在窗口确实装不下时约束显示尺寸；不把临时缩窄覆盖成用户偏好。 */
export function fitAgentPanelSizes(sizes: AgentPanelSizes, viewport: number, leftCollapsed: boolean, rightCollapsed: boolean): AgentPanelSizes {
  if (!Number.isFinite(viewport) || viewport <= 0) return sizes;
  const left = leftCollapsed ? 0 : Math.min(sizes.left, Math.max(120, viewport - AGENT_CENTER_MIN_PX - (rightCollapsed ? 0 : 240)));
  const right = rightCollapsed ? 0 : Math.min(sizes.right, Math.max(0, viewport - left - AGENT_CENTER_MIN_PX));
  return { left, right };
}
