export const MU = 0;       // 总体均值 μ
export const SIGMA = 2;    // 总体标准差 σ

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
/** Box-Muller 产生标准正态随机数 */
function randNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 + 1e-15)) * Math.cos(2 * Math.PI * u2);
}

/** 从 N(μ,σ²) 中抽取大小为 n 的样本，返回 {xbar, s2, sn2} */
export function sampleStats(n: number): { xbar: number; s2: number; sn2: number } {
  let sum = 0;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = MU + SIGMA * randNormal();
    xs.push(x);
    sum += x;
  }
  const xbar = sum / n;
  let ss = 0;
  for (const x of xs) ss += (x - xbar) ** 2;
  return { xbar, s2: ss / (n - 1), sn2: ss / n };
}

/** 五数概括：[min, Q1, median, Q3, max]，用于箱线图 */
export function fiveNum(arr: number[]): [number, number, number, number, number] {
  const s = [...arr].sort((a, b) => a - b);
  const len = s.length;
  const q = (p: number): number => {
    const pos = p * (len - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  return [s[0], q(0.25), q(0.5), q(0.75), s[len - 1]];
}