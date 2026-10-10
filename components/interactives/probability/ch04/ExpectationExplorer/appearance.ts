// ─── 设计常量 ────────────────────────────────────────────────────────────────
export const ACCENT = "#5b46e5";
export const ACCENT_LIGHT = "#ede9fe";
export const RED = "#dc2626";
export const RED_LIGHT = "#fee2e2";
export const GRAY_BG = "var(--bg-muted)";
export const GRAY_STROKE = "var(--line)";
export const INK = "var(--ink)";
export const INK_SOFT = "var(--ink-soft)";

// ─── SVG 布局 ─────────────────────────────────────────────────────────────────
export const SVG_W = 560;
export const SVG_H = 260;
export const AXIS_Y = 210;       // 数轴 y 坐标
export const BAR_BOTTOM = AXIS_Y - 4;
export const BAR_MAX_H = 160;    // 最大柱高度（概率=1 时）
export const X_LEFT = 50;
export const X_RIGHT = SVG_W - 30;
export const X_RANGE = X_RIGHT - X_LEFT;

// x 轴刻度范围
export const X_MIN_VAL = -4;
export const X_MAX_VAL = 10;
export const TICK_COUNT = 15;