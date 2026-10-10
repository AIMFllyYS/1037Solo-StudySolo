import { PAD_L, PLOT_W, PAD_T, PLOT_H } from "./appearance";
import { normPdf } from "@/lib/learning/probability/limits/chebyshev";
// X 轴范围：固定 μ=0，显示 [-6, 6]
export const X_MIN = -6;
export const X_MAX = 6;

// ─── 坐标映射 ────────────────────────────────────────────────
export function toSvgX(x: number): number {
  return PAD_L + ((x - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
}

export function toSvgY(y: number, yMax: number): number {
  return PAD_T + PLOT_H - (y / yMax) * PLOT_H;
}

// ─── 生成正态曲线路径 ────────────────────────────────────────
export function buildCurvePath(sigma: number, yMax: number, steps = 300): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
    const y = normPdf(x, sigma);
    const sx = toSvgX(x);
    const sy = toSvgY(y, yMax);
    parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return parts.join(" ");
}

/**
 * 生成尾部填充区域路径（|x| >= eps 的区间）
 * 分为左尾 [X_MIN, -eps] 和右尾 [eps, X_MAX]
 */
export function buildTailAreaPath(sigma: number, eps: number, yMax: number, steps = 200): string {
  const baseline = toSvgY(0, yMax);
  const parts: string[] = [];

  // 左尾：x in [X_MIN, -eps]
  const leftPoints: string[] = [];
  const leftSteps = Math.floor(steps * ((-eps - X_MIN) / (X_MAX - X_MIN)));
  if (eps < -X_MIN) {
    const startX = toSvgX(X_MIN);
    leftPoints.push(`M${startX.toFixed(2)},${baseline.toFixed(2)}`);
    for (let i = 0; i <= leftSteps; i++) {
      const x = X_MIN + (i / leftSteps) * (-eps - X_MIN);
      const y = normPdf(x, sigma);
      const sx = toSvgX(x);
      const sy = toSvgY(y, yMax);
      leftPoints.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    const endX = toSvgX(-eps);
    leftPoints.push(`L${endX.toFixed(2)},${baseline.toFixed(2)}`);
    leftPoints.push("Z");
    parts.push(leftPoints.join(" "));
  }

  // 右尾：x in [eps, X_MAX]
  if (eps < X_MAX) {
    const rightSteps = Math.floor(steps * ((X_MAX - eps) / (X_MAX - X_MIN)));
    const startX = toSvgX(eps);
    const rightPoints: string[] = [];
    rightPoints.push(`M${startX.toFixed(2)},${baseline.toFixed(2)}`);
    for (let i = 0; i <= rightSteps; i++) {
      const x = eps + (i / rightSteps) * (X_MAX - eps);
      const y = normPdf(x, sigma);
      const sx = toSvgX(x);
      const sy = toSvgY(y, yMax);
      rightPoints.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    const endX = toSvgX(X_MAX);
    rightPoints.push(`L${endX.toFixed(2)},${baseline.toFixed(2)}`);
    rightPoints.push("Z");
    parts.push(rightPoints.join(" "));
  }

  return parts.join(" ");
}