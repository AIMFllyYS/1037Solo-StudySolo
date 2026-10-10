import { normalDensity as normalPDF } from '@/lib/learning/probability/math/normal';

// ─── 分布类型 ─────────────────────────────────────────────────────
export type DistType = "uniform" | "exponential" | "normal";

// ─── 数学辅助 ─────────────────────────────────────────────────────
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function expPDF(x: number, lam: number): number {
  if (x < 0) return 0;
  return lam * Math.exp(-lam * x);
}

export function uniformPDF(x: number, a: number, b: number): number {
  if (x < a || x > b) return 0;
  return 1 / (b - a);
}

// 数值积分（梯形法）
export function trapezoidProb(
  dist: DistType,
  lo: number,
  hi: number,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): number {
  const N = 500;
  const dx = (hi - lo) / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const x = lo + i * dx;
    let f = 0;
    if (dist === "uniform") f = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") f = expPDF(x, params.lam);
    else f = normalPDF(x, params.mu, params.sigma);
    sum += i === 0 || i === N ? f * 0.5 : f;
  }
  return clamp(sum * dx, 0, 1);
}

// ─── 坐标映射 ─────────────────────────────────────────────────────
export interface ViewRange {
  xMin: number;
  xMax: number;
  yMax: number;
}