import { normalDensity as normPDF } from '@/lib/learning/probability/math/normal';

/** 标准正态 CDF（Abramowitz & Stegun 近似，误差 < 1.5e-7） */
function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const p = 1 - normPDF(x, 0, 1) * poly;
  return x >= 0 ? p : 1 - p;
}

/** 正态分布 CDF（任意 mu/sigma） */
export function gaussCDF(x: number, mu: number, sigma: number): number {
  return normCDF((x - mu) / sigma);
}

/** 正态分布逆 CDF 近似（Beasley-Springer-Moro）*/
export function normQuantile(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
    0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
    0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const q = p - 0.5;
  if (Math.abs(q) < 0.42) {
    const r = q * q;
    return q * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) /
      ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
  }
  const r = q < 0 ? Math.log(-Math.log(p)) : Math.log(-Math.log(1 - p));
  let val = c[0];
  for (let i = 1; i < 9; i++) val += c[i] * Math.pow(r, i);
  return q < 0 ? -val : val;
}