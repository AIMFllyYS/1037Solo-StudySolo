// ─── 类型 ─────────────────────────────────────────────────────
export interface Stats {
  n: number;
  sum: number;
  mean: number;
  deviations: number[];   // xi - x̄
  devSq: number[];        // (xi - x̄)²
  sumDevSq: number;       // Σ(xi - x̄)²
  varN: number;           // 除以 n（有偏）
  varN1: number;          // 除以 n-1（无偏）
  stdN: number;
  stdN1: number;
  sorted: number[];       // 顺序统计量
}

// ─── 计算核心 ─────────────────────────────────────────────────
export function calcStats(data: number[]): Stats {
  const n = data.length;
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const deviations = data.map((x) => x - mean);
  const devSq = deviations.map((d) => d * d);
  const sumDevSq = devSq.reduce((a, b) => a + b, 0);
  const varN = sumDevSq / n;
  const varN1 = n > 1 ? sumDevSq / (n - 1) : 0;
  return {
    n,
    sum,
    mean,
    deviations,
    devSq,
    sumDevSq,
    varN,
    varN1,
    stdN: Math.sqrt(varN),
    stdN1: Math.sqrt(varN1),
    sorted: [...data].sort((a, b) => a - b),
  };
}

// ─── Box-Muller 正态随机数 ────────────────────────────────────
export function randNormal(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}