/**
 * 椭圆用参数方程生成点，然后用 polyline 画（避免 A 指令旋转 bug）
 * rx = √λ2 * k * SCALE, ry = √λ1 * k * SCALE
 * 旋转矩阵 [v2, v1]
 */
export function ellipsePoints(
  cx: number,
  cy: number,
  lambda1: number,
  lambda2: number,
  v1: [number, number],
  v2: [number, number],
  kScale: number,
  svgScale: number,
  nPts = 120
): string {
  if (lambda1 < 0 || lambda2 <= 0) return "";
  const rx = Math.sqrt(Math.max(0, lambda2)) * kScale * svgScale;
  const ry = Math.sqrt(Math.max(0, lambda1)) * kScale * svgScale;
  const pts: string[] = [];
  for (let i = 0; i <= nPts; i++) {
    const t = (i / nPts) * 2 * Math.PI;
    const ux = rx * Math.cos(t);
    const uy = ry * Math.sin(t);
    // 旋转：new = ux * v2 + uy * v1
    const px = cx + ux * v2[0] + uy * v1[0];
    // SVG y 轴向下，数学 y 向上 → 取反
    const py = cy - (ux * v2[1] + uy * v1[1]);
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return pts.join(" ");
}