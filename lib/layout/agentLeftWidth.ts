/**
 * Agent 左侧对话栏的「像素锚定」宽度。
 *
 * 为什么需要它（根因）：AgentShell 里「左栏 + 中央对话」是嵌套分栏组，组宽 = 窗口宽度 − 右侧工作区。
 * 分栏库只认百分比，左栏存的是「占嵌套组的百分比」。用户拖右侧面板 / 右侧弹出收起时，
 * 嵌套组变宽变窄，同一个百分比换算出的左栏像素宽度就跟着变——表现为「调好左边，一动右边左边也动」。
 *
 * 新机制：左栏宽度以**像素**为准（用户拖左分隔线后记录并持久化），
 * 嵌套组宽度变化时只把这个像素重新换算成百分比写回，左栏视觉宽度因此恒定；右侧只重分配「中央 vs 右栏」。
 */
export const AGENT_LEFT_PX_KEY = "studysolo-agent-left-px-v1";
/** 嵌套分栏组里左栏的百分比上下限（需与 AgentShell 的 minSize / maxSize 一致）。 */
export const AGENT_LEFT_MIN_PCT = 14;
export const AGENT_LEFT_MAX_PCT = 40;
const MIN_PX = 200;
const MAX_PX = 520;

/** 从未拖过时的默认像素宽度：约占窗口 14%，夹在 240–340 之间。 */
export function defaultAgentLeftPx(viewportWidth: number): number {
  const v = Math.round(viewportWidth * 0.14);
  return Math.min(340, Math.max(240, v));
}

export function clampAgentLeftPx(px: number): number {
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(px)));
}

/** 把锚定的像素宽度换算成嵌套组内的百分比；组宽无效时返回 null。 */
export function agentLeftPercentForPx(px: number, groupWidth: number): number | null {
  if (!Number.isFinite(px) || !Number.isFinite(groupWidth) || groupWidth <= 0) return null;
  const pct = (px / groupWidth) * 100;
  return Math.round(Math.min(AGENT_LEFT_MAX_PCT, Math.max(AGENT_LEFT_MIN_PCT, pct)) * 100) / 100;
}

export function loadAgentLeftPx(viewportWidth: number): number {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(AGENT_LEFT_PX_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n) && n > 0) return clampAgentLeftPx(n);
  } catch {
    /* 隐私模式等：退回默认 */
  }
  return defaultAgentLeftPx(viewportWidth);
}

export function saveAgentLeftPx(px: number): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(AGENT_LEFT_PX_KEY, String(clampAgentLeftPx(px)));
  } catch {
    /* 忽略写入失败 */
  }
}
