/**
 * 分栏默认尺寸（出厂预设）。单位是「占窗口宽度的百分比」。
 *
 * 优先级契约（用户口径，改动前务必先读）：
 * 1. **用户拖过的宽度永远优先**：react-resizable-panels 会把用户拖出来的比例写进 localStorage
 *    （key 形如 `react-resizable-panels:<autoSaveId>`），刷新/下次打开直接用它。
 *    这里的预设只在「这一列从未被拖过」时生效。
 * 2. 程序（应用预设、收起/展开、"全局"模式）**不得**用预设覆盖用户记录；收起时把当时宽度记进
 *    分栏库的 `expandToSizes`，展开时原样恢复。
 * 3. Agent 与 Studio 各档位各自独立（不同 autoSaveId），互不影响。
 * 4. 只走浏览器本地存储，不落数据库。
 */
export interface PanelPreset {
  /** 左栏：Studio 导航树 / Agent 对话列表 */
  left: number;
  /** 中间主区：正文 / 中央对话 */
  center: number;
  /** 右栏默认宽度；0 表示默认收起 */
  right: number;
  /** 右栏从收起状态被打开时的目标宽度 */
  rightExpanded: number;
}

export type PanelPresetKey = "agent" | "studio:full" | "studio:article" | "studio:reference" | "studio:no-right";

export const PANEL_PRESETS: Record<PanelPresetKey, PanelPreset> = {
  /** Agent：右栏是独立工作区，默认约占 3/5；左/中仍留约 14/26 供对话与导航。 */
  agent: { left: 14, center: 26, right: 60, rightExpanded: 60 },
  /** Studio 三档：与改造前的现值完全一致（19 / 50 / 31，article 默认收起右栏）。 */
  "studio:full": { left: 19, center: 50, right: 31, rightExpanded: 31 },
  "studio:article": { left: 19, center: 50, right: 0, rightExpanded: 31 },
  "studio:reference": { left: 19, center: 50, right: 31, rightExpanded: 31 },
  /** 首页 / 复习板等不渲染右栏的 Studio 路由。 */
  "studio:no-right": { left: 19, center: 81, right: 0, rightExpanded: 31 },
};

/**
 * Agent 的左对话栏与中央对话共处一个**嵌套**分栏组（组宽 = 窗口宽度 - 右栏），
 * 组内百分比要把「占窗口」的预设换算过去。
 */
export function nestedShares(preset: PanelPreset): { left: number; center: number } {
  const total = preset.left + preset.center;
  const round = (v: number) => Math.round(v * 10) / 10;
  return { left: round((preset.left / total) * 100), center: round((preset.center / total) * 100) };
}

/** First expand has no pre-collapse size to restore, so seed it with the current Agent default. */
export function expandAgentDockIfCollapsed(panel: {
  isCollapsed: () => boolean;
  expand: (fallbackSize?: number) => void;
}): void {
  if (panel.isCollapsed()) panel.expand(PANEL_PRESETS.agent.right);
}
