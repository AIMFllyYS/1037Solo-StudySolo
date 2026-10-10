// ─── 数学工具 ────────────────────────────────────────────────

/** 标准正态 PDF N(0,1) */
function stdNormPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** 正态 PDF N(0, sigma^2)，即 X ~ N(0, sigma^2) */
export function normPdf(x: number, sigma: number): number {
  if (sigma <= 0) return 0;
  return stdNormPdf(x / sigma) / sigma;
}

/**
 * 标准正态 CDF 近似（Abramowitz & Stegun 数值近似，绝对误差 < 7.5e-8）
 * P(Z ≤ z)
 */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const pdf = stdNormPdf(z);
  const p = 1 - pdf * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * P(|X| >= eps) for X ~ N(0, sigma^2)
 * = 2 * P(X >= eps) = 2 * (1 - Phi(eps/sigma))
 */
export function tailProbability(eps: number, sigma: number): number {
  if (sigma <= 0 || eps <= 0) return 0;
  return 2 * (1 - normCdf(eps / sigma));
}

/**
 * 切比雪夫上界：sigma^2 / eps^2，上截断到 1
 */
export function chebyshevBound(eps: number, sigma: number): number {
  if (eps <= 0) return 1;
  return Math.min(1, (sigma * sigma) / (eps * eps));
}