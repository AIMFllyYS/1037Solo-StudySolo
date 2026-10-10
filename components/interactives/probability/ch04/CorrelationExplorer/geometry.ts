import { PAD, PLOT_W, PLOT_H } from "./appearance";
// ─── 数据归一化：[-3.5,3.5] → SVG 坐标 ──────────────────────────────────────
export const DATA_RANGE = 3.5;
export const DATA_RANGE_Y_MAX = 14; // Y=X² 时纵轴需要更大范围

export function toSvgX(v: number): number {
  return PAD + ((v + DATA_RANGE) / (2 * DATA_RANGE)) * PLOT_W;
}

export function toSvgY(v: number, yRange: number): number {
  return PAD + PLOT_H - ((v + yRange) / (2 * yRange)) * PLOT_H;
}