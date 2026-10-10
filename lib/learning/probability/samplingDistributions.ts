import { standardNormalDensity as normPDF } from '@/lib/learning/probability/math/normal';
// ─── 数学工具：Gamma 函数近似（Lanczos，精度 ~1e-10） ────────────────────────
export function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ─── χ² 分布 PDF：pdf(x; k) = x^(k/2-1) * e^(-x/2) / (2^(k/2) * Γ(k/2)) ──
export function chi2PDF(x: number, k: number): number {
  if (x <= 0) return 0;
  const lp =
    (k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2);
  return Math.exp(lp);
}

// ─── t 分布 PDF：pdf(t; n) = Γ((n+1)/2)/[√(nπ) Γ(n/2)] * (1+t²/n)^(-(n+1)/2) ──
export function tPDF(t: number, n: number): number {
  const lp =
    lnGamma((n + 1) / 2) -
    0.5 * Math.log(n * Math.PI) -
    lnGamma(n / 2) -
    ((n + 1) / 2) * Math.log(1 + (t * t) / n);
  return Math.exp(lp);
}

// ─── F 分布 PDF ───────────────────────────────────────────────────────────────
export function fPDF(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const lp =
    0.5 * d1 * Math.log(d1) +
    0.5 * d2 * Math.log(d2) +
    (0.5 * d1 - 1) * Math.log(x) -
    ((d1 + d2) / 2) * Math.log(d2 + d1 * x) +
    lnGamma((d1 + d2) / 2) -
    lnGamma(d1 / 2) -
    lnGamma(d2 / 2);
  return Math.exp(lp);
}

// ─── 不完全 Gamma 正则化（用于数值积分/CDF，正则化下不完全 Gamma 函数） ────────
// 使用级数展开（小 x）和连分式展开（大 x）
export function incGammaLower(a: number, x: number): number {
  // 使用级数展开：P(a,x) = e^{-x} x^a / Γ(a) * Σ_{n=0}^∞ x^n / Γ(a+n+1)/Γ(a)
  if (x < 0) return 0;
  if (x === 0) return 0;
  // 用级数展开
  let sum = 1.0 / a;
  let term = 1.0 / a;
  let aa = a;
  for (let i = 1; i < 150; i++) {
    aa += 1;
    term *= x / aa;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-9) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * sum;
}

// χ² CDF（正则化下不完全 Gamma P(k/2, x/2)）
export function chi2CDF(x: number, k: number): number {
  if (x <= 0) return 0;
  return incGammaLower(k / 2, x / 2);
}

// ─── 数值积分（梯形法，高精度） ───────────────────────────────────────────────
export function integrate(
  f: (x: number) => number,
  lo: number,
  hi: number,
  steps = 800
): number {
  const h = (hi - lo) / steps;
  let s = 0.5 * (f(lo) + f(hi));
  for (let i = 1; i < steps; i++) s += f(lo + i * h);
  return s * h;
}

// ─── χ² 临界值（二分法求解 P(χ² > c) = α） ──────────────────────────────────
export function chi2Critical(k: number, alpha: number): number {
  let a = 0.001;
  let b = k + 10 * Math.sqrt(2 * k) + 10;
  // 确保区间有效：P(χ²>a) > alpha > P(χ²>b)
  for (let iter = 0; iter < 100; iter++) {
    const mid = (a + b) / 2;
    const pVal = 1 - chi2CDF(mid, k);
    if (pVal > alpha) a = mid;
    else b = mid;
    if (b - a < 1e-7) return (a + b) / 2;
  }
  return (a + b) / 2;
}

// ─── t 分布临界值（双侧，二分法） ────────────────────────────────────────────
// 数值积分求 CDF
export function tCDFRight(t: number, n: number): number {
  // P(T > t) 用数值积分
  const upper = t + 30;
  return integrate((x) => tPDF(x, n), t, upper, 600);
}

export function tCritical(n: number, alpha: number): number {
  // 双侧：P(|T| > c) = alpha => P(T > c) = alpha/2
  const target = alpha / 2;
  let lo = 0.001;
  let hi = 20;
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const p = tCDFRight(mid, n);
    if (p > target) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6) return (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}

// ─── F 分布临界值（二分法） ───────────────────────────────────────────────────
export function fCDFRight(x: number, d1: number, d2: number): number {
  const upper = x + 40;
  return integrate((t) => fPDF(t, d1, d2), x, upper, 600);
}

export function fCritical(d1: number, d2: number, alpha: number): number {
  let lo = 0.001;
  let hi = 20;
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const p = fCDFRight(mid, d1, d2);
    if (p > alpha) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6) return (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}

// ─── 类型 ────────────────────────────────────────────────────────────────────
export type TabId = "chi2" | "t" | "F";

// ─── 生成曲线点 ───────────────────────────────────────────────────────────────
export interface CurveConfig {
  tabId: TabId;
  chi2N: number;
  tN: number;
  fM: number;
  fN: number;
  alpha: number;
  showNormal: boolean;
}

export interface CurveResult {
  xs: number[];
  ys: number[];
  normYs: number[];
  xLo: number;
  xHi: number;
  yMax: number;
  critical: number;
  criticalLabel: string;
  tailArea: number;
}

export function computeCurve(cfg: CurveConfig): CurveResult {
  const { tabId, chi2N, tN, fM, fN, alpha } = cfg;
  const POINTS = 400;

  let xLo: number, xHi: number, pdfFn: (x: number) => number, critical: number, criticalLabel: string;

  if (tabId === "chi2") {
    xLo = 0.01;
    xHi = Math.max(chi2N * 3, 20);
    pdfFn = (x) => chi2PDF(x, chi2N);
    critical = chi2Critical(chi2N, alpha);
    criticalLabel = `χ²_α(${chi2N}) = ${critical.toFixed(3)}`;
  } else if (tabId === "t") {
    const span = Math.max(4, Math.sqrt(tN + 2) * 3);
    xLo = -span;
    xHi = span;
    pdfFn = (x) => tPDF(x, tN);
    critical = tCritical(tN, alpha);
    criticalLabel = `t_{α/2}(${tN}) = ${critical.toFixed(3)}`;
  } else {
    xLo = 0.01;
    xHi = Math.max((fM / fN) * 6 + 2, 6);
    pdfFn = (x) => fPDF(x, fM, fN);
    critical = fCritical(fM, fN, alpha);
    criticalLabel = `F_α(${fM},${fN}) = ${critical.toFixed(3)}`;
  }

  const step = (xHi - xLo) / POINTS;
  const xs: number[] = [];
  const ys: number[] = [];
  const normYs: number[] = [];

  for (let i = 0; i <= POINTS; i++) {
    const x = xLo + i * step;
    xs.push(x);
    ys.push(pdfFn(x));
    // 正态对照（标准化到相同均值/方差级别）
    if (tabId === "chi2") {
      const mean = chi2N;
      const std = Math.sqrt(2 * chi2N);
      normYs.push(normPDF((x - mean) / std) / std);
    } else if (tabId === "t") {
      normYs.push(normPDF(x));
    } else {
      const mean = fN > 2 ? fN / (fN - 2) : 1;
      const v = fN > 4 ? (2 * fN * fN * (fM + fN - 2)) / (fM * (fN - 2) ** 2 * (fN - 4)) : 1;
      const std = Math.sqrt(v);
      normYs.push(normPDF((x - mean) / std) / std);
    }
  }

  const yMax = Math.max(...ys) * 1.12;

  // 右尾面积（数值积分）
  const tailArea = integrate(pdfFn, critical, xHi + 20, 600);

  return { xs, ys, normYs, xLo, xHi, yMax, critical, criticalLabel, tailArea };
}
