import { PAD_L, PLOT_W, PAD_T, PLOT_H } from "./appearance";

// ─── x 轴坐标映射 ───────────────────────────────────────────────
export function xToSvg(x: number, xMin: number, xMax: number): number {
  return PAD_L + ((x - xMin) / (xMax - xMin)) * PLOT_W;
}

export function svgToX(svgX: number, xMin: number, xMax: number): number {
  return xMin + ((svgX - PAD_L) / PLOT_W) * (xMax - xMin);
}

export function yToSvg(y: number, yMax: number): number {
  return PAD_T + (1 - y / yMax) * PLOT_H;
}