// ─── 类型 ─────────────────────────────────────────────────────────────────────
export interface Interval {
  mean: number;   // 样本均值
  lo: number;     // 区间下界
  hi: number;     // 区间上界
  covers: boolean; // 是否覆盖 μ
}

// ─── 统计辅助函数 ─────────────────────────────────────────────────────────────

// 标准正态分位数（Box-Muller 近似的反函数，此处用精确多项式近似）
export function invNorm(p: number): number {
  // Beasley-Springer-Moro 近似
  const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
              6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
              -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
              3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// t 分布分位数（Wilson-Hilferty 近似）
export function invT(p: number, df: number): number {
  // 对于大自由度退化到正态
  if (df >= 200) return invNorm(p);
  // 小样本用 Hill (1970) 精确迭代
  // 先用正态初始估计，再做一次 Newton 修正
  const z = invNorm(p);
  const g1 = (z * z * z + z) / (4 * df);
  const g2 = (5 * z * z * z * z * z + 16 * z * z * z + 3 * z) / (96 * df * df);
  const g3 = (3 * z * z * z * z * z * z * z + 19 * z * z * z * z * z + 17 * z * z * z - 15 * z) /
             (384 * df * df * df);
  return z + g1 + g2 + g3;
}

// Box-Muller 生成标准正态随机数
export function randNorm(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
}

// 总体参数（固定）
export const MU = 0;       // 总体均值
export const SIGMA = 1;    // 总体标准差（已知，供 Z 区间使用）
export const MAX_INTERVALS = 200;