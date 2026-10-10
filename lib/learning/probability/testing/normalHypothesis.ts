import { standardNormalDensity as normPDF } from '@/lib/learning/probability/math/normal';

// 下边距（留给 x 轴标注）

// ─── 数学工具 ──────────────────────────────────────────────────
// 标准正态 CDF（Abramowitz & Stegun 近似，精度 ≈ 1e-5）
function normCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 0.5 + sign * (0.5 - normPDF(Math.abs(x)) * poly);
}

// 从 alpha 和检验类型计算临界值
export function getCriticalValues(
  alpha: number,
  testType: TestType
): { zLeft: number | null; zRight: number | null } {
  if (testType === "left") {
    // 找 c 使 normCDF(c) = alpha => c = normInv(alpha)
    return { zLeft: normInv(alpha), zRight: null };
  } else if (testType === "right") {
    return { zLeft: null, zRight: normInv(1 - alpha) };
  } else {
    // 双尾：每侧 alpha/2
    return { zLeft: normInv(alpha / 2), zRight: normInv(1 - alpha / 2) };
  }
}

// 正态分布逆函数（Rational approximation）
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Beasley-Springer-Moro 近似
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let x = 0;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
        c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  return x;
}

// 计算 p 值
export function computePValue(z: number, testType: TestType): number {
  if (testType === "left") {
    return normCDF(z);
  } else if (testType === "right") {
    return 1 - normCDF(z);
  } else {
    return 2 * (1 - normCDF(Math.abs(z)));
  }
}

// 检验类型
export type TestType = "left" | "right" | "two";