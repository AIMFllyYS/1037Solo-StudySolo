// ─── 统计辅助函数 ────────────────────────────────────────────────

/** Box-Muller 变换生成标准正态随机数 */
function randNorm(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** 从 N(mu, sigma^2) 抽 n 个样本，返回 [xbar, s2] */
export function drawSample(mu: number, sigma: number, n: number): [number, number] {
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    const x = mu + sigma * randNorm();
    sum += x;
    sum2 += x * x;
  }
  const xbar = sum / n;
  const s2 = n > 1 ? (sum2 - n * xbar * xbar) / (n - 1) : 0;
  return [xbar, s2];
}

/** 正态 PDF：N(mu, sigma^2) */
export function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** 卡方分布 PDF：χ²(k) */
export function chi2PDF(x: number, k: number): number {
  if (x <= 0 || k <= 0) return 0;
  const halfK = k / 2;
  return (
    Math.pow(x, halfK - 1) *
    Math.exp(-x / 2) /
    (Math.pow(2, halfK) * gammaFunc(halfK))
  );
}

/** t 分布 PDF：t(nu)，精度足够用于可视化 */
export function tPDF(x: number, nu: number): number {
  if (nu <= 0) return 0;
  const halfNuPlus1 = (nu + 1) / 2;
  const halfNu = nu / 2;
  return (
    gammaFunc(halfNuPlus1) /
    (Math.sqrt(nu * Math.PI) * gammaFunc(halfNu)) *
    Math.pow(1 + (x * x) / nu, -halfNuPlus1)
  );
}

/** Lanczos 近似 Gamma 函数 */
function gammaFunc(z: number): number {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaFunc(1 - z));
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const zz = z - 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (zz + i);
  }
  const t = zz + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, zz + 0.5) * Math.exp(-t) * x;
}

/** 正态分布 CDF（近似） */
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const cdf = 1 - normalPDF(x, 0, 1) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/** 卡方分布 CDF（正规化不完全 gamma，数值积分近似） */
export function chi2CDF(x: number, k: number): number {
  if (x <= 0) return 0;
  return lowerIncompleteGamma(k / 2, x / 2) / gammaFunc(k / 2);
}

/** 下不完全 gamma 函数（级数展开） */
function lowerIncompleteGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  let sum = 0;
  let term = 1 / a;
  sum = term;
  for (let i = 1; i < 200; i++) {
    term *= x / (a + i);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x)) * sum;
}

/** t 分布 CDF */
export function tCDF(x: number, nu: number): number {
  // via incomplete beta
  const t2 = x * x;
  const ibeta = incompleteBeta(nu / (nu + t2), nu / 2, 0.5);
  const p = ibeta / 2;
  return x >= 0 ? 1 - p : p;
}

/** 正规化不完全 Beta（连分数） */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = gammaFunc(a) * gammaFunc(b) / gammaFunc(a + b);
  const factor = Math.pow(x, a) * Math.pow(1 - x, b) / (a * lbeta);
  // Lentz 连分数
  let h = 1;
  let f = 1;
  let C = 1;
  let D = 1 - (a + b) * x / (a + 1);
  if (Math.abs(D) < 1e-30) D = 1e-30;
  D = 1 / D;
  f = D;
  for (let m = 1; m <= 100; m++) {
    const m2 = 2 * m;
    let d = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    D = 1 + d * D;
    if (Math.abs(D) < 1e-30) D = 1e-30;
    C = 1 + d / C;
    if (Math.abs(C) < 1e-30) C = 1e-30;
    D = 1 / D;
    h = D * C;
    f *= h;
    d = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    D = 1 + d * D;
    if (Math.abs(D) < 1e-30) D = 1e-30;
    C = 1 + d / C;
    if (Math.abs(C) < 1e-30) C = 1e-30;
    D = 1 / D;
    h = D * C;
    f *= h;
    if (Math.abs(h - 1) < 1e-7) break;
  }
  return factor * f;
}

/** Kolmogorov–Smirnov 检验 p 值（近似公式）*/
export function ksPValue(D: number, n: number): number {
  // Kolmogorov 分布近似 P(K ≤ t) ≈ 1 - 2 * sum_{k=1}^∞ (-1)^{k+1} exp(-2k²t²)
  const t = D * Math.sqrt(n);
  if (t < 0.27) return 1;
  let sum = 0;
  for (let k = 1; k <= 50; k++) {
    sum += Math.pow(-1, k + 1) * Math.exp(-2 * k * k * t * t);
  }
  const p = 2 * sum;
  return Math.max(0, Math.min(1, p));
}

/** 计算 KS 统计量 D（给定一组数据和理论 CDF）*/
export function ksStatistic(sorted: number[], cdf: (x: number) => number): number {
  const n = sorted.length;
  let D = 0;
  for (let i = 0; i < n; i++) {
    const Fn = (i + 1) / n;
    const F = cdf(sorted[i]);
    D = Math.max(D, Math.abs(Fn - F));
  }
  return D;
}

// ─── 直方图数据计算 ────────────────────────────────────────────

interface HistBin {
  lo: number;
  hi: number;
  count: number;
}

export function makeHistogram(data: number[], nBins: number, lo: number, hi: number): HistBin[] {
  const bins: HistBin[] = [];
  const step = (hi - lo) / nBins;
  for (let i = 0; i < nBins; i++) {
    bins.push({ lo: lo + i * step, hi: lo + (i + 1) * step, count: 0 });
  }
  for (const v of data) {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / step)));
    bins[idx].count++;
  }
  return bins;
}