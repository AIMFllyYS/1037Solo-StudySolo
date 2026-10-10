import { standardNormalDensity as normPDF } from '@/lib/learning/probability/math/normal';

import { H, PT, PB, W, PL, PR, X_MIN, X_MAX } from "./appearance";
// 正态分布 x -> SVG y
export function pdfToY(pdf: number, maxPdf: number): number {
  const plotH = H - PT - PB;
  return PT + plotH * (1 - pdf / maxPdf);
}
export function xToSvg(x: number): number {
  const plotW = W - PL - PR;
  return PL + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
}

// 正态曲线路径（共 N+1 点）
export function buildCurvePath(n = 300): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const xv = X_MIN + ((X_MAX - X_MIN) * i) / n;
    const yv = pdfToY(normPDF(xv), normPDF(0));
    pts.push(`${i === 0 ? "M" : "L"}${xToSvg(xv).toFixed(2)},${yv.toFixed(2)}`);
  }
  return pts.join(" ");
}

// 构建拒绝域填充路径（在 [xL, xR] 之间的区域）
export function buildRejectPath(xL: number, xR: number, steps = 120): string {
  const baseY = pdfToY(0, normPDF(0));
  const pts: string[] = [];
  // 起始点
  pts.push(`M${xToSvg(xL).toFixed(2)},${baseY.toFixed(2)}`);
  for (let i = 0; i <= steps; i++) {
    const xv = xL + ((xR - xL) * i) / steps;
    const yv = pdfToY(normPDF(xv), normPDF(0));
    pts.push(`L${xToSvg(xv).toFixed(2)},${yv.toFixed(2)}`);
  }
  pts.push(`L${xToSvg(xR).toFixed(2)},${baseY.toFixed(2)}`);
  pts.push("Z");
  return pts.join(" ");
}