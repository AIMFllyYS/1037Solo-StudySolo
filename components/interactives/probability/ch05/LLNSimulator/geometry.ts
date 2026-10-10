import { PAD_L, CHART_W } from "./appearance";
// ─── SVG 坐标映射 ─────────────────────────────────────────────
export function xPos(i: number, total: number): number {
  return PAD_L + (i / (total - 1)) * CHART_W;
}

export function yPos(value: number, yMin: number, yMax: number, chartH: number, padT: number): number {
  const ratio = (value - yMin) / (yMax - yMin);
  return padT + chartH * (1 - ratio);
}

export function linePath(points: [number, number][]): string {
  if (points.length === 0) return "";
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}