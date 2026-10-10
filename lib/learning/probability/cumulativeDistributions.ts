export { normalDensity as normalPDF } from '@/lib/learning/probability/math/normal';
// ─── 分布类型 ───────────────────────────────────────────────────
export type DistType = "binomial" | "normal" | "exponential";

// ─── 数学工具 ───────────────────────────────────────────────────
// 二项分布 PMF：P(X=k) = C(n,k) * p^k * (1-p)^(n-k)
export function binomPMF(k: number, n: number, p: number): number {
  if (k < 0 || k > n || !Number.isInteger(k)) return 0;
  return binomCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export function binomCoeff(n: number, k: number): number {
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export function binomCDF(x: number, n: number, p: number): number {
  let sum = 0;
  for (let k = 0; k <= Math.floor(x); k++) {
    sum += binomPMF(k, n, p);
  }
  return Math.min(sum, 1);
}

// 正态分布 CDF（使用 erf 近似）
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const result = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? result : -result;
}

export function normalCDF(x: number, mu: number, sigma: number): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

// 指数分布 PDF
export function expPDF(x: number, lambda: number): number {
  if (x < 0) return 0;
  return lambda * Math.exp(-lambda * x);
}

// 指数分布 CDF
export function expCDF(x: number, lambda: number): number {
  if (x < 0) return 0;
  return 1 - Math.exp(-lambda * x);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
