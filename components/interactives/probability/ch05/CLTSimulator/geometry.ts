import { PAD_L, CHART_W, PAD_T, CHART_H } from "./appearance";
// ─── 坐标映射 ─────────────────────────────────────────────────
export function xChart(z: number): number {
  // z ∈ [-4, 4] → [PAD_L, PAD_L + CHART_W]
  return PAD_L + ((z + 4) / 8) * CHART_W;
}

export function yChart(density: number, maxDensity: number): number {
  return PAD_T + CHART_H - (density / maxDensity) * CHART_H;
}