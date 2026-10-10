// ─── 分布类型 ─────────────────────────────────────────────────────
export type DistType = "exponential" | "bernoulli";

// ─── 对数似然计算 ─────────────────────────────────────────────────
export function logLikelihood(dist: DistType, theta: number, data: number[]): number {
  if (data.length === 0) return -Infinity;
  if (dist === "exponential") {
    // X ~ Exp(λ), θ = λ > 0
    // logL = n·ln(λ) - λ·Σxᵢ
    if (theta <= 0) return -Infinity;
    const n = data.length;
    const sumX = data.reduce((s, x) => s + x, 0);
    return n * Math.log(theta) - theta * sumX;
  } else {
    // X ~ Bernoulli(p), θ = p ∈ (0,1)
    // logL = k·ln(p) + (n-k)·ln(1-p)
    if (theta <= 0 || theta >= 1) return -Infinity;
    const n = data.length;
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    const ll1 = k > 0 ? k * Math.log(theta) : 0;
    const ll2 = n - k > 0 ? (n - k) * Math.log(1 - theta) : 0;
    return ll1 + ll2;
  }
}

// ─── MLE 解析解 ──────────────────────────────────────────────────
export function computeMLE(dist: DistType, data: number[]): number {
  if (data.length === 0) return NaN;
  if (dist === "exponential") {
    // θ̂ = 1 / x̄
    const mean = data.reduce((s, x) => s + x, 0) / data.length;
    return mean > 0 ? 1 / mean : NaN;
  } else {
    // θ̂ = k/n
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    return k / data.length;
  }
}

// ─── θ 轴范围配置 ────────────────────────────────────────────────
interface ThetaRange {
  min: number;
  max: number;
  label: string;
  unit: string;
}

export function getThetaRange(dist: DistType): ThetaRange {
  if (dist === "exponential") {
    return { min: 0.05, max: 5, label: "λ（率参数）", unit: "" };
  }
  return { min: 0.01, max: 0.99, label: "p（成功概率）", unit: "" };
}

// ─── 生成默认样本 ─────────────────────────────────────────────────
export function defaultData(dist: DistType): number[] {
  if (dist === "exponential") {
    // 指数分布均值=1，λ=1，MLE 解析解 = 1.0
    return [0.5, 1.2, 0.8, 2.1, 0.3, 1.5, 0.9, 0.4, 1.8, 0.6];
  }
  // 伯努利，约 6/10 成功，MLE = 0.6
  return [1, 0, 1, 1, 0, 1, 0, 1, 1, 0];
}

// ─── 数值区间 ─────────────────────────────────────────────────────
export function computeLLRange(
  dist: DistType,
  data: number[],
  tMin: number,
  tMax: number,
  steps = 200
): { llMin: number; llMax: number } {
  let llMin = Infinity;
  let llMax = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const theta = tMin + (i / steps) * (tMax - tMin);
    const ll = logLikelihood(dist, theta, data);
    if (isFinite(ll)) {
      if (ll < llMin) llMin = ll;
      if (ll > llMax) llMax = ll;
    }
  }
  if (!isFinite(llMin) || !isFinite(llMax)) return { llMin: -10, llMax: 0 };
  // 给顶部留一点空间
  const span = llMax - llMin || 1;
  return { llMin: llMin - span * 0.1, llMax: llMax + span * 0.15 };
}