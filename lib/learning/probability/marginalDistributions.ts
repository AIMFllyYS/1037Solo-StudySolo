export { rowMarginals as marginalX } from '@/lib/learning/probability/math/marginals';
export { columnMarginals as marginalY } from '@/lib/learning/probability/math/marginals';
// ─── 类型 ─────────────────────────────────────────────────────────────────────
export type Mode = "rowSelect" | "colSelect";
export type Tab = "main" | "counterexample";

// ─── 预设联合分布 ──────────────────────────────────────────────────────────────
export const PRESET_MAIN: number[][] = [
  [0.10, 0.08, 0.06],
  [0.12, 0.18, 0.10],
  [0.08, 0.14, 0.14],
];

// 反例：两组不同联合分布，但边缘分布完全相同
// 联合分布 A
export const CE_A: number[][] = [
  [0.2, 0.1, 0.1],
  [0.1, 0.2, 0.1],
  [0.1, 0.1, 0.0],
];
// 联合分布 B（不同于 A，但行/列之和相同）
export const CE_B: number[][] = [
  [0.15, 0.15, 0.1],
  [0.15, 0.1, 0.15],
  [0.1, 0.05, 0.05],
];

export const X_LABELS = ["x₁", "x₂", "x₃"];
export const Y_LABELS = ["y₁", "y₂", "y₃"];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
export function normalize(raw: number[][]): number[][] {
  let sum = 0;
  for (const row of raw) for (const v of row) sum += Math.max(0, v);
  if (sum === 0) return raw.map((row) => row.map(() => 1 / 9));
  return raw.map((row) => row.map((v) => Math.max(0, v) / sum));
}

export function randomRaw(n: number): number[][] {
  return Array.from({ length: n }, () =>
    Array.from({ length: n }, () => Math.random())
  );
}
