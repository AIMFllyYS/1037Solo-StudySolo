// ─── 设计常量 ────────────────────────────────────────────────────
export const ACCENT = "#5b46e5"; // 与 alpha 拼接（如 `${ACCENT}30`），保留 hex
export const ACCENT_LIGHT = "var(--accent-weak)";
export const MLE_COLOR = "#0f766e";
export const MLE_LIGHT = "#0f766e22"; // 半透明青绿，深浅色皆可读
export const CURSOR_COLOR = "#f59e0b";
export const CURVE_COLOR = "#5b46e5";

// ─── SVG 布局参数 ─────────────────────────────────────────────────
export const SVG_W = 520;
export const SVG_H = 220;
export const PAD_L = 52;
const PAD_R = 20;
export const PAD_T = 18;
const PAD_B = 36;
export const CHART_W = SVG_W - PAD_L - PAD_R;
export const CHART_H = SVG_H - PAD_T - PAD_B;