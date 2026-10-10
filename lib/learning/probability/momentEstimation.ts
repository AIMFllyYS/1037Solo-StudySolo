export { parseSamples } from '@/lib/learning/probability/samples';
// ─── 分布类型 ─────────────────────────────────────────────────────
export type DistType = "exponential" | "normal" | "uniform";

// ─── 样本统计量 ───────────────────────────────────────────────────
export function sampleMean(data: number[]): number {
  if (data.length === 0) return NaN;
  return data.reduce((s, x) => s + x, 0) / data.length;
}

export function sampleMean2(data: number[]): number {
  // 二阶样本矩 (1/n)·Σxᵢ²
  if (data.length === 0) return NaN;
  return data.reduce((s, x) => s + x * x, 0) / data.length;
}

// ─── 矩估计量 ─────────────────────────────────────────────────────
export interface EstimateResult {
  params: Record<string, number>;
}

export function momentEstimate(dist: DistType, data: number[]): EstimateResult {
  if (data.length === 0) return { params: {} };
  const m1 = sampleMean(data);
  const m2 = sampleMean2(data);
  const b2 = m2 - m1 * m1; // 样本二阶中心矩

  if (dist === "exponential") {
    // E[X] = 1/λ → λ̂ = 1/x̄
    return { params: { lambda: 1 / m1 } };
  } else if (dist === "normal") {
    // E[X]=μ, D(X)=σ² → μ̂=x̄, σ̂²=B₂
    return { params: { mu: m1, sigma2: b2, sigma: Math.sqrt(Math.max(0, b2)) } };
  } else {
    // uniform [a,b]: E[X]=(a+b)/2, D(X)=(b-a)²/12
    // → a+b=2m1, (b-a)²=12b2 → b-a=√(12b2)
    // → b̂=m1+√(3b2), â=m1-√(3b2)
    const half = Math.sqrt(Math.max(0, 3 * b2));
    return { params: { a: m1 - half, b: m1 + half } };
  }
}

// ─── 分布配置（含真实参数默认值）────────────────────────────────
export interface DistConfig {
  label: string;
  shortLabel: string;
  paramNames: string[];
  trueParamLabels: string[];
  trueParamDefaults: number[];
  trueParamMin: number[];
  trueParamMax: number[];
  trueParamStep: number[];
  generateSample: (params: number[], n: number) => number[];
}

export const DIST_CONFIGS: Record<DistType, DistConfig> = {
  exponential: {
    label: "指数分布 Exp(λ)",
    shortLabel: "Exp(λ)",
    paramNames: ["lambda"],
    trueParamLabels: ["真实 λ"],
    trueParamDefaults: [1.5],
    trueParamMin: [0.1],
    trueParamMax: [5],
    trueParamStep: [0.1],
    generateSample: ([lambda], n) => {
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        arr.push(-Math.log(1 - Math.random()) / lambda);
      }
      return arr;
    },
  },
  normal: {
    label: "正态分布 N(μ, σ²)",
    shortLabel: "N(μ,σ²)",
    paramNames: ["mu", "sigma2", "sigma"],
    trueParamLabels: ["真实 μ", "真实 σ"],
    trueParamDefaults: [2, 1.5],
    trueParamMin: [-5, 0.1],
    trueParamMax: [5, 5],
    trueParamStep: [0.1, 0.1],
    generateSample: ([mu, sigma], n) => {
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        // Box-Muller
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
        arr.push(mu + sigma * z);
      }
      return arr;
    },
  },
  uniform: {
    label: "均匀分布 U(a, b)",
    shortLabel: "U(a,b)",
    paramNames: ["a", "b"],
    trueParamLabels: ["真实 a", "真实 b"],
    trueParamDefaults: [1, 5],
    trueParamMin: [-5, 0],
    trueParamMax: [0, 10],
    trueParamStep: [0.1, 0.1],
    generateSample: ([a, b], n) => {
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        arr.push(a + Math.random() * (b - a));
      }
      return arr;
    },
  },
};
