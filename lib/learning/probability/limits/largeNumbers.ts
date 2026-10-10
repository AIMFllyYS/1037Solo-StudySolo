export const NUM_LINES = 20;

// ─── 分布类型 ──────────────────────────────────────────────────
export type DistType = "bernoulli" | "uniform" | "exponential";

interface DistInfo {
  name: string;
  mean: number;
  variance: number;
  sample: () => number;
}

export function getDistInfo(dist: DistType, param: number): DistInfo {
  if (dist === "bernoulli") {
    const p = param;
    return {
      name: `伯努利(p=${p.toFixed(2)})`,
      mean: p,
      variance: p * (1 - p),
      sample: () => (Math.random() < p ? 1 : 0),
    };
  }
  if (dist === "uniform") {
    // Uniform[0, 2*param] => mean = param, var = (2*param)^2/12
    const b = 2 * param;
    return {
      name: `均匀(0,${b.toFixed(1)})`,
      mean: param,
      variance: (b * b) / 12,
      sample: () => Math.random() * b,
    };
  }
  // exponential: mean = 1/lambda = param, var = param^2
  return {
    name: `指数(λ=${(1 / param).toFixed(2)})`,
    mean: param,
    variance: param * param,
    sample: () => -param * Math.log(1 - Math.random()),
  };
}

// ─── 模拟单条 X̄n 折线 ─────────────────────────────────────────
export function simulateLine(
  distInfo: DistInfo,
  nMax: number,
  steps: number
): number[] {
  // 返回 steps 个均匀采样点的 X̄_{n_i}
  const ns = buildNSteps(nMax, steps);
  let acc = 0;
  let ni = 0;
  const result: number[] = [];
  for (let i = 1; i <= ns[ns.length - 1]; i++) {
    acc += distInfo.sample();
    if (i === ns[ni]) {
      result.push(acc / i);
      ni++;
    }
  }
  return result;
}

// ─── n 的采样点（对数等间距，更好地展示收敛） ─────────────────
export function buildNSteps(nMax: number, steps: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const n = Math.max(1, Math.round(Math.exp(t * Math.log(nMax))));
    if (result.length === 0 || result[result.length - 1] !== n) {
      result.push(n);
    }
  }
  return result;
}

export const STEPS = 60;

// ─── 切比雪夫上界 ─────────────────────────────────────────────
export function chebyshevBound(variance: number, epsilon: number, n: number): number {
  return Math.min(1, variance / (n * epsilon * epsilon));
}