import { PAD_L, CHART_W, PAD_T, CHART_H } from "./appearance";
import { logLikelihood } from "@/lib/learning/probability/estimation/likelihood";
import type { DistType } from "@/lib/learning/probability/estimation/likelihood";
// ─── SVG 坐标映射 ─────────────────────────────────────────────────
export function svgX(theta: number, tMin: number, tMax: number): number {
  return PAD_L + ((theta - tMin) / (tMax - tMin)) * CHART_W;
}

export function svgY(ll: number, llMin: number, llMax: number): number {
  if (!isFinite(ll)) return PAD_T + CHART_H;
  const ratio = (ll - llMin) / (llMax - llMin);
  return PAD_T + CHART_H * (1 - Math.max(0, Math.min(1, ratio)));
}

// ─── 曲线路径生成 ─────────────────────────────────────────────────
export function buildCurvePath(
  dist: DistType,
  data: number[],
  tMin: number,
  tMax: number,
  llMin: number,
  llMax: number,
  steps = 200
): { path: string; points: Array<{ theta: number; ll: number }> } {
  const points: Array<{ theta: number; ll: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const theta = tMin + (i / steps) * (tMax - tMin);
    const ll = logLikelihood(dist, theta, data);
    points.push({ theta, ll });
  }
  // 仅保留有限值点
  const finitePoints = points.filter((p) => isFinite(p.ll));
  if (finitePoints.length < 2) return { path: "", points };

  const segs: string[] = [];
  let inSeg = false;
  for (const { theta, ll } of points) {
    if (!isFinite(ll)) {
      inSeg = false;
      continue;
    }
    const cx = svgX(theta, tMin, tMax);
    const cy = svgY(ll, llMin, llMax);
    if (!inSeg) {
      segs.push(`M${cx.toFixed(2)},${cy.toFixed(2)}`);
      inSeg = true;
    } else {
      segs.push(`L${cx.toFixed(2)},${cy.toFixed(2)}`);
    }
  }
  return { path: segs.join(" "), points };
}