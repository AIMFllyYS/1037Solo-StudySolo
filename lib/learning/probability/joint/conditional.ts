// ─── 类型 ─────────────────────────────────────────────────────
export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

// ─── 联合分布默认值（独立）────────────────────────────────────
export const INDEP_JOINT: Matrix3x3 = [
  [0.06, 0.09, 0.15],
  [0.08, 0.12, 0.20],
  [0.06, 0.09, 0.15],
];

// 相关联合分布（X 与 Y 正相关）
export const CORR_JOINT: Matrix3x3 = [
  [0.20, 0.08, 0.02],
  [0.08, 0.22, 0.06],
  [0.02, 0.06, 0.26],
];

export function clampPositive(v: number): number {
  return Math.max(0, v);
}

// 归一化整个矩阵使总和为 1
export function normalizeMatrix(m: Matrix3x3): Matrix3x3 {
  let total = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) total += m[i][j];
  if (total === 0) return m;
  return m.map((row) => row.map((v) => v / total)) as Matrix3x3;
}

// 边缘分布 P(X=xj) = sum_i joint[i][j]
export function marginalX(m: Matrix3x3): [number, number, number] {
  return [0, 1, 2].map((j) => m[0][j] + m[1][j] + m[2][j]) as [number, number, number];
}

// 条件分布 P(X=xj | Y=yi) = joint[i][j] / rowSum[i]
export function conditionalXgivenY(m: Matrix3x3, rowIdx: number): [number, number, number] {
  const rowSum = m[rowIdx][0] + m[rowIdx][1] + m[rowIdx][2];
  if (rowSum === 0) return [0, 0, 0];
  return m[rowIdx].map((v) => v / rowSum) as [number, number, number];
}