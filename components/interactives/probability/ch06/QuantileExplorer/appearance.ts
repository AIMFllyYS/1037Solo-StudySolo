import type { Distribution } from "@/lib/learning/probability/sampling/quantiles";
// ─── 设计常量 ────────────────────────────────────────────────────────────────
export const ACCENT = "var(--accent)";
export const ACCENT_LIGHT = "var(--accent-weak)";
export const ORANGE = "#ea580c";
export const ORANGE_LIGHT = "#ea580c1f"; // 半透明橙，深浅色皆可读
export const GREEN = "#0f766e";
export const GREEN_LIGHT = "#0f766e22"; // 半透明绿，深浅色皆可读
export const GRAY_LINE = "var(--line)";
export const GRAY_BG = "var(--bg-muted)";

// ─── SVG 辅助 ────────────────────────────────────────────────────────────────

export const SVG_W = 300;
export const SVG_H = 240;
export const PAD = { top: 20, right: 20, bottom: 36, left: 42 };

// ─── 分布描述 ────────────────────────────────────────────────────────────────

export const DIST_META: Record<Distribution, { label: string; color: string; on: string; bg: string; desc: string }> = {
  normal: {
    label: "正态 N(0,1)",
    color: ACCENT,
    on: "var(--md-sys-color-on-primary)",
    bg: ACCENT_LIGHT,
    desc: "点接近对角线 → 服从正态分布",
  },
  uniform: {
    label: "均匀 U(0,1)",
    color: GREEN,
    on: "#ffffff",
    bg: GREEN_LIGHT,
    desc: "S 形弯曲 → 尾部轻于正态（尾巴短）",
  },
  exponential: {
    label: "指数 Exp(1)",
    color: ORANGE,
    on: "#ffffff",
    bg: ORANGE_LIGHT,
    desc: "右端上翘 → 右偏分布（长右尾）",
  },
};