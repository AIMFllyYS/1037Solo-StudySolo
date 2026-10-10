import { normalDensity as normPDF } from '@/lib/learning/probability/math/normal';

import { PAD_L, PLOT_W, PAD_T, PLOT_H } from "./appearance";
// ─── 坐标映射 ────────────────────────────────────────────────────────────────
export const X_MIN = -4;
export const X_MAX = 7;

export function toSvgX(v: number): number {
  return PAD_L + ((v - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
}

export function toSvgY(v: number, maxY: number): number {
  return PAD_T + PLOT_H - (v / maxY) * PLOT_H;
}

// ─── 生成 SVG 路径 ────────────────────────────────────────────────────────────
export function makeCurvePath(mu: number, sigma: number, maxY: number, steps = 300): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
    const y = normPDF(x, mu, sigma);
    const sx = toSvgX(x);
    const sy = toSvgY(y, maxY);
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

/** 生成曲线在 [xLo, xHi] 范围内的填充路径（梯形封底） */
export function makeFillPath(mu: number, sigma: number, maxY: number, xLo: number, xHi: number, steps = 100): string {
  const pts: string[] = [];
  const lo = Math.max(xLo, X_MIN);
  const hi = Math.min(xHi, X_MAX);
  if (lo >= hi) return "";
  for (let i = 0; i <= steps; i++) {
    const x = lo + (i / steps) * (hi - lo);
    const y = normPDF(x, mu, sigma);
    const sx = toSvgX(x).toFixed(2);
    const sy = toSvgY(y, maxY).toFixed(2);
    pts.push(`${i === 0 ? "M" : "L"}${sx},${sy}`);
  }
  const baseY = toSvgY(0, maxY).toFixed(2);
  pts.push(`L${toSvgX(hi).toFixed(2)},${baseY}`);
  pts.push(`L${toSvgX(lo).toFixed(2)},${baseY}`);
  pts.push("Z");
  return pts.join(" ");
}