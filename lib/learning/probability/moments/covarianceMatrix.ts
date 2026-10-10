// 坐标单位到像素

// ─── 数学工具 ──────────────────────────────────────────────────────────────────
/** 计算 2×2 对称矩阵 [[a,b],[b,d]] 的特征值（升序）和特征向量 */
export function eigen2x2(
  a: number,
  b: number,
  d: number
): { lambda1: number; lambda2: number; v1: [number, number]; v2: [number, number] } {
  const tr = a + d;
  const det = a * d - b * b;
  const disc = Math.max(0, (tr / 2) ** 2 - det);
  const sqrtDisc = Math.sqrt(disc);
  const lambda1 = tr / 2 - sqrtDisc; // 较小特征值
  const lambda2 = tr / 2 + sqrtDisc; // 较大特征值

  // 特征向量（对应 lambda2 的方向）
  let v2: [number, number];
  if (Math.abs(b) > 1e-10) {
    // [lambda2 - d, b] solves (A - lambda2 I)v = 0.
    // Using lambda2 - a in the first coordinate swaps the axis when a !== d.
    const len2 = Math.hypot(lambda2 - d, b);
    v2 = [(lambda2 - d) / len2, b / len2];
  } else {
    // 对角矩阵
    v2 = a >= d ? [1, 0] : [0, 1];
  }
  // v1 垂直于 v2
  const v1: [number, number] = [-v2[1], v2[0]];

  return { lambda1, lambda2, v1, v2 };
}

/** 判断 2×2 协方差矩阵是否半正定 */
export function isPosSemiDef(s1sq: number, s2sq: number, rho: number): boolean {
  if (s1sq <= 0 || s2sq <= 0) return false;
  const det = s1sq * s2sq - rho * rho * s1sq * s2sq;
  return det >= 0 && s1sq + s2sq >= 0;
}
