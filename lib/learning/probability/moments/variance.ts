// ─── 数学：正态 PDF ──────────────────────────────────────────────────────────
export function normalPDF(x: number, mu: number, sigma: number): number {
  const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const exp = Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
  return coeff * exp;
}