// ─── 分布类型 ─────────────────────────────────────────────────
export type DistType = "normal" | "uniform" | "exponential" | "bernoulli";

export interface DistParams {
  type: DistType;
  // Normal: mu, sigma
  // Uniform: a, b
  // Exponential: lambda
  // Bernoulli: p
  p1: number;
  p2: number;
}

interface DistConfig {
  label: string;
  params: [string, string, number, number, number][];
  // [display name, key, min, max, step]
  mean: (d: DistParams) => number;
  variance: (d: DistParams) => number;
  sample: (d: DistParams) => number;
  pdf?: (x: number, d: DistParams) => number;
  support: (d: DistParams) => [number, number];
}

export const DIST_CONFIGS: Record<DistType, DistConfig> = {
  normal: {
    label: "正态分布 N(μ,σ²)",
    params: [
      ["均值 μ", "p1", -3, 3, 0.1],
      ["标准差 σ", "p2", 0.2, 3, 0.1],
    ],
    mean: (d) => d.p1,
    variance: (d) => d.p2 * d.p2,
    sample: (d) => {
      // Box–Muller
      const u = 1 - Math.random();
      const v = Math.random();
      return d.p1 + d.p2 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pdf: (x, d) => {
      const s = d.p2;
      const mu = d.p1;
      return (
        Math.exp(-0.5 * ((x - mu) / s) ** 2) /
        (s * Math.sqrt(2 * Math.PI))
      );
    },
    support: (d) => [d.p1 - 4 * d.p2, d.p1 + 4 * d.p2],
  },
  uniform: {
    label: "均匀分布 U(a,b)",
    params: [
      ["左端 a", "p1", -5, 4, 0.5],
      ["右端 b", "p2", -4, 5, 0.5],
    ],
    mean: (d) => (d.p1 + d.p2) / 2,
    variance: (d) => Math.max(0, (d.p2 - d.p1) ** 2 / 12),
    sample: (d) => d.p1 + Math.random() * Math.max(0.001, d.p2 - d.p1),
    pdf: (x, d) => {
      const len = d.p2 - d.p1;
      if (len <= 0) return 0;
      return x >= d.p1 && x <= d.p2 ? 1 / len : 0;
    },
    support: (d) => [d.p1 - 0.5, d.p2 + 0.5],
  },
  exponential: {
    label: "指数分布 Exp(λ)",
    params: [
      ["速率 λ", "p1", 0.2, 4, 0.1],
      ["偏移 c", "p2", 0, 3, 0.25],
    ],
    mean: (d) => d.p2 + 1 / d.p1,
    variance: (d) => 1 / (d.p1 * d.p1),
    sample: (d) => d.p2 + -Math.log(1 - Math.random()) / d.p1,
    pdf: (x, d) => {
      const shifted = x - d.p2;
      if (shifted < 0) return 0;
      return d.p1 * Math.exp(-d.p1 * shifted);
    },
    support: (d) => [d.p2, d.p2 + 8 / d.p1],
  },
  bernoulli: {
    label: "伯努利分布 B(p)",
    params: [
      ["成功概率 p", "p1", 0.05, 0.95, 0.05],
      ["倍率 k", "p2", 1, 5, 1],
    ],
    mean: (d) => d.p1 * d.p2,
    variance: (d) => d.p1 * (1 - d.p1) * d.p2 * d.p2,
    sample: (d) => (Math.random() < d.p1 ? d.p2 : 0),
    support: () => [-0.5, 5.5],
  },
};

// ─── 辅助：生成 N 个样本 ────────────────────────────────────────
export function sampleDist(d: DistParams, n: number): number[] {
  const cfg = DIST_CONFIGS[d.type];
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(cfg.sample(d));
  return arr;
}

// ─── 辅助：将样本装桶为直方图 ───────────────────────────────────
export function buildHistogram(
  data: number[],
  binMin: number,
  binMax: number,
  numBins: number
): number[] {
  const bins = new Array<number>(numBins).fill(0);
  const span = binMax - binMin;
  if (span <= 0) return bins;
  for (const v of data) {
    const idx = Math.floor(((v - binMin) / span) * numBins);
    const clamped = Math.min(Math.max(idx, 0), numBins - 1);
    bins[clamped]++;
  }
  return bins;
}

// ─── 辅助：判断是否有解析 PDF ────────────────────────────────────
export function hasAnalyticConvPDF(xType: DistType, yType: DistType): boolean {
  if (xType === "normal" && yType === "normal") return true;
  if (xType === "uniform" && yType === "uniform") return true;
  if (xType === "exponential" && yType === "exponential") return true;
  return false;
}

// 计算解析卷积 PDF（支持部分组合）
export function analyticConvPDF(
  z: number,
  xDist: DistParams,
  yDist: DistParams
): number {
  const xt = xDist.type;
  const yt = yDist.type;

  // Normal + Normal → Normal(μ₁+μ₂, σ₁²+σ₂²)
  if (xt === "normal" && yt === "normal") {
    const mu = xDist.p1 + yDist.p1;
    const sigma = Math.sqrt(xDist.p2 ** 2 + yDist.p2 ** 2);
    return (
      Math.exp(-0.5 * ((z - mu) / sigma) ** 2) /
      (sigma * Math.sqrt(2 * Math.PI))
    );
  }

  // Exp(λ₁) + Exp(λ₂) → Hypo-exponential or Erlang(2,λ) if λ₁=λ₂
  if (xt === "exponential" && yt === "exponential") {
    const lam1 = xDist.p1;
    const lam2 = yDist.p1;
    const shift = xDist.p2 + yDist.p2;
    const s = z - shift;
    if (s < 0) return 0;
    if (Math.abs(lam1 - lam2) < 1e-6) {
      // Erlang(2,λ)
      return lam1 * lam1 * s * Math.exp(-lam1 * s);
    }
    return (
      (lam1 * lam2) / (lam2 - lam1) *
      (Math.exp(-lam1 * s) - Math.exp(-lam2 * s))
    );
  }

  // Uniform[a1,b1] + Uniform[a2,b2] → Trapezoid / Triangle
  if (xt === "uniform" && yt === "uniform") {
    const a1 = xDist.p1,
      b1 = Math.max(xDist.p1 + 0.001, xDist.p2);
    const a2 = yDist.p1,
      b2 = Math.max(yDist.p1 + 0.001, yDist.p2);
    const len1 = b1 - a1;
    const len2 = b2 - a2;
    const lo = a1 + a2;
    const hi = b1 + b2;
    if (z <= lo || z >= hi) return 0;
    // 分段计算三角/梯形卷积
    const t = z - lo;
    const m1 = b1 - a1;
    const m2 = b2 - a2;
    // max(0,t-m2) .. min(t, m1) 积分
    const upper = Math.min(t, m1);
    const lower = Math.max(0, t - m2);
    if (upper <= lower) return 0;
    return (upper - lower) / (len1 * len2);
  }

  return 0;
}