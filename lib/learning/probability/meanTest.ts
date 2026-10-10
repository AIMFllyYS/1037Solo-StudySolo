import { gammaLanczos } from '@/lib/learning/probability/math/gamma';
export { standardNormalDensity as normalPDF } from '@/lib/learning/probability/math/normal';
export { gammaLanczos } from '@/lib/learning/probability/math/gamma';

// Error function approximation (Abramowitz & Stegun 7.1.26)
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-x * x));
}

// Standard normal CDF
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Regularized incomplete beta function (continued fraction, used for t-CDF)
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = Math.log(gammaLanczos(a)) + Math.log(gammaLanczos(b)) - Math.log(gammaLanczos(a + b));
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  // Lentz's continued fraction
  let f = 1,
    c = 1,
    d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + num * d;
    c = 1 + num / c;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;
    num = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + num * d;
    c = 1 + num / c;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return front * f;
}

// t-distribution CDF (df degrees of freedom)
export function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = betaInc(df / 2, 0.5, x);
  if (t >= 0) return 1 - 0.5 * ib;
  return 0.5 * ib;
}

// t-distribution PDF
export function tPDF(x: number, df: number): number {
  const lc =
    Math.log(gammaLanczos((df + 1) / 2)) -
    Math.log(gammaLanczos(df / 2)) -
    0.5 * Math.log(df * Math.PI);
  return Math.exp(lc - ((df + 1) / 2) * Math.log(1 + (x * x) / df));
}

// Normal quantile (inverse CDF) — rational approximation
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// t critical value via bisection (df degrees of freedom, upper-tail probability p)
export function tQuantile(p: number, df: number): number {
  if (p <= 0) return Infinity;
  if (p >= 1) return -Infinity;
  // Initial bracket
  let lo = -10,
    hi = 10;
  while (tCDF(hi, df) < p) hi *= 2;
  while (tCDF(lo, df) > p) lo *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tCDF(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Utility types ────────────────────────────────────────────────────────
export type TestType = "z" | "t";
export type TailType = "left" | "right" | "two";
export type AlphaLevel = 0.01 | 0.05 | 0.1;

export interface TestResult {
  statistic: number;
  pValue: number;
  criticalLow: number;
  criticalHigh: number;
  reject: boolean;
}

// ─── Compute test result ──────────────────────────────────────────────────
export function computeTest(
  xbar: number,
  mu0: number,
  spread: number,
  n: number,
  tail: TailType,
  alpha: AlphaLevel,
  type: TestType
): TestResult {
  const se = spread / Math.sqrt(n);
  const stat = (xbar - mu0) / se;
  const df = n - 1;

  let pValue: number;
  let criticalLow: number;
  let criticalHigh: number;

  if (type === "z") {
    if (tail === "left") {
      pValue = normalCDF(stat);
      criticalLow = -Infinity;
      criticalHigh = normalQuantile(alpha);
    } else if (tail === "right") {
      pValue = 1 - normalCDF(stat);
      criticalLow = normalQuantile(1 - alpha);
      criticalHigh = Infinity;
    } else {
      pValue = 2 * Math.min(normalCDF(stat), 1 - normalCDF(stat));
      criticalLow = normalQuantile(alpha / 2);
      criticalHigh = normalQuantile(1 - alpha / 2);
    }
  } else {
    if (tail === "left") {
      pValue = tCDF(stat, df);
      criticalLow = -Infinity;
      criticalHigh = tQuantile(alpha, df);
    } else if (tail === "right") {
      pValue = 1 - tCDF(stat, df);
      criticalLow = tQuantile(1 - alpha, df);
      criticalHigh = Infinity;
    } else {
      pValue = 2 * Math.min(tCDF(stat, df), 1 - tCDF(stat, df));
      criticalLow = tQuantile(alpha / 2, df);
      criticalHigh = tQuantile(1 - alpha / 2, df);
    }
  }

  const reject =
    tail === "left"
      ? stat < criticalHigh!
      : tail === "right"
      ? stat > criticalLow!
      : stat < criticalLow! || stat > criticalHigh!;

  return {
    statistic: stat,
    pValue: Math.max(0, Math.min(1, pValue)),
    criticalLow,
    criticalHigh,
    reject,
  };
}
