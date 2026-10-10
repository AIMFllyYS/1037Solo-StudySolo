// ─── 设计常量 ──────────────────────────────────────────────────
export const ACCENT = "#5b46e5"; // 与 alpha 拼接（如 ACCENT + "22"），保留 hex
export const ACCENT_LIGHT = "var(--accent-weak)";
export const GREEN = "#0f766e";
export const GREEN_LIGHT = "#0f766e22"; // 半透明绿，深浅色皆可读
export const ORANGE = "#ea580c";
export const GRAY_LINE = "var(--line)";

// ─── SVG 尺寸 ──────────────────────────────────────────────────
export const SVG_W = 520;
export const SVG_H = 220;
export const PAD_L = 46;
export const PAD_R = 14;
export const PAD_T = 14;
const PAD_B = 32;
export const CHART_W = SVG_W - PAD_L - PAD_R;
export const CHART_H = SVG_H - PAD_T - PAD_B;