import { logAbsGammaLanczos } from '@/lib/learning/probability/math/gamma';
export { gammaLanczos } from '@/lib/learning/probability/math/gamma';

export function logGamma(z: number): number {
  return logAbsGammaLanczos(z);
}

// ─── χ² distribution PDF: f(x; k) = x^(k/2-1) * e^(-x/2) / (2^(k/2) * Γ(k/2)) ──
export function chi2PDF(x: number, k: number): number {
  if (x <= 0) return 0;
  const k2 = k / 2;
  const logPDF = (k2 - 1) * Math.log(x) - x / 2 - k2 * Math.log(2) - logGamma(k2);
  return Math.exp(logPDF);
}

// ─── Regularized incomplete gamma function P(a, x) = γ(a,x)/Γ(a) ─────────────
// Used for χ² CDF: P(k/2, x/2)
export function regularizedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series expansion
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n <= 300; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  } else {
    // Upper gamma continued fraction: DLMF 8.9.2, evaluated by modified Lentz.
    // Q(a,x) is the prefactor times this reciprocal fraction, not divided by it.
    let b = x + 1 - a;
    let c = 1e30;
    let d = 1 / b;
    let f = d;
    for (let i = 1; i <= 300; i++) {
      const an = i * (a - i);
      b += 2;
      d = b + an * d;
      c = b + an / c;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * f;
  }
}

// χ² CDF: P(χ² ≤ x) = regularizedGammaP(k/2, x/2)
export function chi2CDF(x: number, k: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(k / 2, x / 2);
}

// ─── χ² quantile via bisection ───────────────────────────────────────────────
export function chi2Quantile(p: number, k: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  // Initial guess: using Wilson-Hilferty approximation
  const mu = k;
  const sigma2 = 2 * k;
  let x = Math.max(0.01, mu + Math.sqrt(sigma2) * (p > 0.5 ? 2 : -2));
  // Bisection
  let lo = 0;
  let hi = Math.max(100, k * 5);
  while (chi2CDF(hi, k) < p) hi *= 2;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (chi2CDF(mid, k) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-9) break;
  }
  x = (lo + hi) / 2;
  return x;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type TailType = "left" | "right" | "two";
export type AlphaLevel = 0.01 | 0.05 | 0.1;

export interface TestResult {
  chi2Stat: number;
  df: number;
  pValue: number;
  criticalLow: number;   // lower critical value (for left/two)
  criticalHigh: number;  // upper critical value (for right/two)
  reject: boolean;
}

// ─── Compute χ² variance test ────────────────────────────────────────────────
export function computeVarianceTest(
  s2: number,
  n: number,
  sigma02: number,
  tail: TailType,
  alpha: AlphaLevel
): TestResult {
  const df = n - 1;
  const chi2Stat = (df * s2) / sigma02;

  let pValue: number;
  let criticalLow: number;
  let criticalHigh: number;

  if (tail === "left") {
    pValue = chi2CDF(chi2Stat, df);
    criticalLow = 0;
    criticalHigh = chi2Quantile(alpha, df);
  } else if (tail === "right") {
    pValue = 1 - chi2CDF(chi2Stat, df);
    criticalLow = chi2Quantile(1 - alpha, df);
    criticalHigh = Infinity;
  } else {
    // two-sided: reject if chi2 < chi2_{alpha/2} OR chi2 > chi2_{1-alpha/2}
    const pLeft = chi2CDF(chi2Stat, df);
    const pRight = 1 - chi2CDF(chi2Stat, df);
    pValue = 2 * Math.min(pLeft, pRight);
    criticalLow = chi2Quantile(alpha / 2, df);
    criticalHigh = chi2Quantile(1 - alpha / 2, df);
  }

  const reject =
    tail === "left"
      ? chi2Stat < criticalHigh
      : tail === "right"
      ? chi2Stat > criticalLow
      : chi2Stat < criticalLow || chi2Stat > criticalHigh;

  return {
    chi2Stat,
    df,
    pValue: Math.max(0, Math.min(1, pValue)),
    criticalLow,
    criticalHigh,
    reject,
  };
}
