// ─── 类型定义 ─────────────────────────────────────────────────
export type DistKey = "normal" | "uniform" | "exponential";
export type TransformKey = "square" | "abs" | "linear" | "exp";

export interface DistConfig {
  label: string;
  shortLabel: string;
  sample: () => number;
  pdf: (x: number) => number;
  xMin: number;
  xMax: number;
  color: string;
}

export interface TransformConfig {
  label: string;
  shortLabel: string;
  apply: (x: number) => number;
  theoreticalPdf: (y: number, dist: DistKey) => number;
  yMin: (dist: DistKey) => number;
  yMax: (dist: DistKey) => number;
  note: string;
}

// ─── 高斯采样（Box-Muller） ───────────────────────────────────
export function gaussianSample(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── 变换配置（含理论 PDF） ──────────────────────────────────
export function normalPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

// ─── 直方图计算 ──────────────────────────────────────────────
export interface HistBin {
  x0: number;
  x1: number;
  density: number;
}

export function buildHistogram(data: number[], bins: number, yMin: number, yMax: number): HistBin[] {
  const result: HistBin[] = [];
  const step = (yMax - yMin) / bins;
  const counts = new Array<number>(bins).fill(0);
  let total = 0;
  for (const v of data) {
    if (v < yMin || v > yMax) continue;
    const idx = Math.min(Math.floor((v - yMin) / step), bins - 1);
    counts[idx]++;
    total++;
  }
  for (let i = 0; i < bins; i++) {
    result.push({
      x0: yMin + i * step,
      x1: yMin + (i + 1) * step,
      density: total > 0 ? counts[i] / (total * step) : 0,
    });
  }
  return result;
}