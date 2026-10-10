// ─── 设计常量 ────────────────────────────────────────────────────────────────
export const ACCENT = "#5b46e5";
export const ACCENT_LIGHT = "var(--accent-weak)";
export const ACCENT_MID = "#7c6af0";

// 热力图色阶：白→浅紫→中紫→深紫
export function heatColor(ratio: number): string {
  // ratio in [0, 1]
  const stops = [
    [240, 238, 255], // #f0eeff - 几乎白
    [189, 176, 255], // #bdb0ff - 浅紫
    [124, 106, 240], // #7c6af0 - 中紫
    [63,  39, 186],  // #3f27ba - 深紫
  ];
  const t = Math.max(0, Math.min(1, ratio));
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round(a[0] + f * (b[0] - a[0]));
  const g = Math.round(a[1] + f * (b[1] - a[1]));
  const bl = Math.round(a[2] + f * (b[2] - a[2]));
  return `rgb(${r},${g},${bl})`;
}

export const CELL = 56;       // 主格子大小
export const MARGIN_L = 28;   // 左侧 X 标签宽度
export const MARGIN_T = 20;   // 顶部 Y 标签高度
export const MARGIN_BAR = 10; // 主格到边缘柱之间的间距
export const BAR_W = 36;      // 边缘分布柱的最大长度（px）
export const BAR_CELL = 46;   // 边缘分布格子大小

export const N = 3;
export const SVG_W = MARGIN_L + N * CELL + MARGIN_BAR + BAR_CELL + 4;
export const SVG_H = MARGIN_T + N * CELL + MARGIN_BAR + BAR_CELL + 4;