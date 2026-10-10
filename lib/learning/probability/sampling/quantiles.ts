// ─── 数学工具 ─────────────────────────────────────────────────────────────────

/** Box-Muller 生成标准正态样本（在事件处理函数内调用） */
function randNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 指数分布采样：F(x)=1-e^{-λx}，令 λ=1 */
function randExp(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return -Math.log(u);
}

/** 均匀分布 U(0,1) */
function randUniform(): number {
  return Math.random();
}

/** 标准正态分布分位数 — Beasley-Springer-Moro 近似 */
function normQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;

  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  const x = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return p < 0.5 ? -x : x;
}

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type Distribution = "normal" | "uniform" | "exponential";

export interface QQPoint {
  theoretical: number;
  sample: number;
  rank: number;
}

// ─── 生成函数 ─────────────────────────────────────────────────────────────────

export function generateSample(dist: Distribution, n: number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    if (dist === "normal") raw.push(randNormal());
    else if (dist === "uniform") raw.push(randUniform());
    else raw.push(randExp());
  }
  return raw.sort((a, b) => a - b);
}

/** 计算 Q-Q 图点：横轴 = 正态理论分位数，纵轴 = 样本分位数（Z-score 化） */
export function computeQQ(sorted: number[]): QQPoint[] {
  const n = sorted.length;
  if (n === 0) return [];

  // 对样本做 Z-score 标准化，便于与标准正态对比
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;

  return sorted.map((v, i) => {
    // Filliben 公式: p_i = (i+1 - 0.375) / (n + 0.25)，避免 0 和 1
    const p = (i + 1 - 0.375) / (n + 0.25);
    return {
      theoretical: normQuantile(p),
      sample: (v - mean) / std,
      rank: i + 1,
    };
  });
}

// ─── 统计摘要 ─────────────────────────────────────────────────────────────────

export function computeStats(sorted: number[]) {
  const n = sorted.length;
  if (n === 0) return null;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const q1 = sorted[Math.floor(n * 0.25)];
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const skewness = n > 2
    ? sorted.reduce((a, b) => a + ((b - mean) / (std || 1)) ** 3, 0) / n
    : 0;
  return { mean, std, median, q1, q3, skewness };
}

/** 用相关系数粗估正态性，> 0.95 认为"接近正态" */
export function qqCorrelation(points: QQPoint[]): number {
  if (points.length < 3) return 1;
  const xs = points.map((p) => p.theoretical);
  const ys = points.map((p) => p.sample);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0));
  const dy = Math.sqrt(ys.reduce((a, y) => a + (y - my) ** 2, 0));
  return dx * dy > 0 ? num / (dx * dy) : 1;
}