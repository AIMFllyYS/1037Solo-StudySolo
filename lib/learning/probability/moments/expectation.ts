// X_MAX_VAL - X_MIN_VAL + 1

// ─── 类型 ─────────────────────────────────────────────────────────────────────
export interface Mass {
  x: number;    // 取值 (X_MIN_VAL ~ X_MAX_VAL)
  p: number;    // 概率 (0 ~ 1)
}

// ─── 预设分布 ──────────────────────────────────────────────────────────────
// 二项 B(4, 0.5)
export function presetBinomial(): Mass[] {
  const n = 4;
  const p = 0.5;
  const result: Mass[] = [];
  for (let k = 0; k <= n; k++) {
    const coef = binom(n, k);
    result.push({ x: k, p: coef * Math.pow(p, k) * Math.pow(1 - p, n - k) });
  }
  return result;
}

// 泊松 Poisson(λ=2)，取 k=0..4
export function presetPoisson(): Mass[] {
  const lambda = 2;
  const result: Mass[] = [];
  for (let k = 0; k <= 4; k++) {
    result.push({ x: k, p: (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k) });
  }
  return result;
}

// 几何 Geometric(p=0.5)，取 k=1..5
export function presetGeometric(): Mass[] {
  const p = 0.5;
  const result: Mass[] = [];
  for (let k = 1; k <= 5; k++) {
    result.push({ x: k, p: p * Math.pow(1 - p, k - 1) });
  }
  return result;
}

function binom(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  let num = 1;
  let den = 1;
  for (let i = 0; i < k; i++) {
    num *= n - i;
    den *= i + 1;
  }
  return num / den;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// ─── 初始分布 ─────────────────────────────────────────────────────────────────
export const INITIAL_MASSES: Mass[] = [
  { x: 0, p: 0.1 },
  { x: 2, p: 0.3 },
  { x: 4, p: 0.3 },
  { x: 6, p: 0.2 },
  { x: 8, p: 0.1 },
];

// ─── 计算统计量 ───────────────────────────────────────────────────────────────
export function computeStats(masses: Mass[]) {
  const sumP = masses.reduce((s, m) => s + m.p, 0);
  const ex = masses.reduce((s, m) => s + m.x * m.p, 0) / (sumP || 1);
  const ex2 = masses.reduce((s, m) => s + m.x * m.x * m.p, 0) / (sumP || 1);
  const variance = ex2 - ex * ex;
  return { sumP, ex, ex2, variance };
}