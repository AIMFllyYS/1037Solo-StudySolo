import { normalDensity as normalPDF } from '@/lib/learning/probability/math/normal';

import { uniformPDF, expPDF, clamp } from "@/lib/learning/probability/distributions/density";
import type { ViewRange, DistType } from "@/lib/learning/probability/distributions/density";
import { PAD_L, PLOT_W, PAD_T, PLOT_H } from "./appearance";
export function toSVGX(x: number, vr: ViewRange): number {
  return PAD_L + ((x - vr.xMin) / (vr.xMax - vr.xMin)) * PLOT_W;
}

export function toSVGY(y: number, vr: ViewRange): number {
  return PAD_T + PLOT_H - (y / vr.yMax) * PLOT_H;
}

export function fromSVGX(sx: number, vr: ViewRange): number {
  return vr.xMin + ((sx - PAD_L) / PLOT_W) * (vr.xMax - vr.xMin);
}

// ─── 生成曲线路径和填色路径 ────────────────────────────────────────
export function buildCurvePath(
  dist: DistType,
  vr: ViewRange,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): string {
  const N = 300;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = vr.xMin + (i / N) * (vr.xMax - vr.xMin);
    let y = 0;
    if (dist === "uniform") y = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") y = expPDF(x, params.lam);
    else y = normalPDF(x, params.mu, params.sigma);
    y = clamp(y, 0, vr.yMax);
    const sx = toSVGX(x, vr);
    const sy = toSVGY(y, vr);
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

export function buildFillPath(
  dist: DistType,
  lo: number,
  hi: number,
  vr: ViewRange,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): string {
  const N = 200;
  const pts: string[] = [];
  const baseY = toSVGY(0, vr);
  // 起点在底部
  pts.push(`M${toSVGX(lo, vr).toFixed(2)},${baseY.toFixed(2)}`);
  for (let i = 0; i <= N; i++) {
    const x = lo + (i / N) * (hi - lo);
    let y = 0;
    if (dist === "uniform") y = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") y = expPDF(x, params.lam);
    else y = normalPDF(x, params.mu, params.sigma);
    y = clamp(y, 0, vr.yMax);
    const sx = toSVGX(x, vr);
    const sy = toSVGY(y, vr);
    pts.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  pts.push(`L${toSVGX(hi, vr).toFixed(2)},${baseY.toFixed(2)}`);
  pts.push("Z");
  return pts.join(" ");
}