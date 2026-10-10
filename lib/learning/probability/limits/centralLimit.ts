// ─── 分布类型 ──────────────────────────────────────────────────
export type DistType = "uniform" | "exponential" | "poisson" | "binomial";

interface DistInfo {
  name: string;
  shortName: string;
  mean: number;
  variance: number;
  /** 采样一个随机变量 */
  sample: () => number;
}

export function getDistInfo(dist: DistType): DistInfo {
  if (dist === "uniform") {
    // Uniform[0, 1]: mean=0.5, var=1/12
    return {
      name: "均匀分布 U(0,1)",
      shortName: "均匀",
      mean: 0.5,
      variance: 1 / 12,
      sample: () => Math.random(),
    };
  }
  if (dist === "exponential") {
    // Exp(λ=1): mean=1, var=1
    return {
      name: "指数分布 Exp(1)",
      shortName: "指数",
      mean: 1,
      variance: 1,
      sample: () => -Math.log(1 - Math.random()),
    };
  }
  if (dist === "poisson") {
    // Poisson(λ=2): mean=2, var=2
    const lambda = 2;
    return {
      name: "泊松分布 P(λ=2)",
      shortName: "泊松",
      mean: lambda,
      variance: lambda,
      sample: () => {
        // Knuth 算法
        const L = Math.exp(-lambda);
        let k = 0;
        let p = 1;
        do {
          k++;
          p *= Math.random();
        } while (p > L);
        return k - 1;
      },
    };
  }
  // binomial: B(n=10, p=0.3): mean=3, var=2.1
  const bn = 10;
  const bp = 0.3;
  return {
    name: "二项分布 B(10,0.3)",
    shortName: "二项",
    mean: bn * bp,
    variance: bn * bp * (1 - bp),
    sample: () => {
      let s = 0;
      for (let i = 0; i < bn; i++) {
        if (Math.random() < bp) s++;
      }
      return s;
    },
  };
}

// ─── 正态 PDF N(0,1) ───────────────────────────────────────────
export function normalPDF(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// ─── K-S 检验统计量（与 N(0,1) 比较） ─────────────────────────
function normalCDF(z: number): number {
  // 近似公式
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - normalPDF(Math.abs(z)) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

export function computeKS(sortedZ: number[]): number {
  const n = sortedZ.length;
  if (n === 0) return 0;
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    const empirical = (i + 1) / n;
    const theory = normalCDF(sortedZ[i]);
    const d = Math.abs(empirical - theory);
    const d2 = Math.abs(empirical - 1 / n - theory);
    if (d > maxD) maxD = d;
    if (d2 > maxD) maxD = d2;
  }
  return maxD;
}

// ─── 直方图 bin 计算 ─────────────────────────────────────────
interface HistBin {
  z: number;      // bin 中心
  left: number;   // bin 左边界
  right: number;  // bin 右边界
  count: number;
  density: number; // count / (n * binWidth)
}

export function buildHistogram(values: number[], binCount: number): HistBin[] {
  const zMin = -4;
  const zMax = 4;
  const binWidth = (zMax - zMin) / binCount;
  const bins: HistBin[] = Array.from({ length: binCount }, (_, i) => {
    const left = zMin + i * binWidth;
    const right = left + binWidth;
    return { z: left + binWidth / 2, left, right, count: 0, density: 0 };
  });
  for (const v of values) {
    const idx = Math.floor((v - zMin) / binWidth);
    if (idx >= 0 && idx < binCount) {
      bins[idx].count++;
    }
  }
  const total = values.length;
  for (const bin of bins) {
    bin.density = total > 0 ? bin.count / (total * binWidth) : 0;
  }
  return bins;
}