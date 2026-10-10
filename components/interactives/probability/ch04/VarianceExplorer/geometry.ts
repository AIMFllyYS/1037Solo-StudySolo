import { PAD_L, PLOT_W, PAD_T, PLOT_H } from "./appearance";
import { normalPDF } from "@/lib/learning/probability/moments/variance";
// x 轴显示范围：共同的 [-5, 5]
export const X_MIN = -5;
export const X_MAX = 5;

export function xToSvg(x: number): number {
  return PAD_L + ((x - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
}

export function yToSvg(y: number, yMax: number): number {
  return PAD_T + PLOT_H - (y / yMax) * PLOT_H;
}

// ─── 生成正态曲线的 SVG path ─────────────────────────────────────────────────
export function buildCurvePath(mu: number, sigma: number, yMax: number, steps = 320): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
    const y = normalPDF(x, mu, sigma);
    const sx = xToSvg(x).toFixed(2);
    const sy = yToSvg(y, yMax).toFixed(2);
    pts.push(`${i === 0 ? "M" : "L"}${sx},${sy}`);
  }
  return pts.join(" ");
}

// ─── 生成填色区域 path（±nSigma 范围）────────────────────────────────────────
export function buildFillPath(
  mu: number,
  sigma: number,
  yMax: number,
  nSigma: number,
  steps = 160
): string {
  const lo = mu - nSigma * sigma;
  const hi = mu + nSigma * sigma;
  const xLo = Math.max(lo, X_MIN);
  const xHi = Math.min(hi, X_MAX);
  if (xLo >= xHi) return "";

  const topPts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xLo + (i / steps) * (xHi - xLo);
    const y = normalPDF(x, mu, sigma);
    const sx = xToSvg(x).toFixed(2);
    const sy = yToSvg(y, yMax).toFixed(2);
    topPts.push(`${i === 0 ? "M" : "L"}${sx},${sy}`);
  }
  const baselineY = yToSvg(0, yMax).toFixed(2);
  const x1 = xToSvg(xHi).toFixed(2);
  const x0 = xToSvg(xLo).toFixed(2);
  return `${topPts.join(" ")} L${x1},${baselineY} L${x0},${baselineY} Z`;
}