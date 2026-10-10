// Shared only after token-identical implementations and dependencies were verified.
// 正态分布 PDF

export function normalDensity(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
// ─── Math helpers ──────────────────────────────────────────────────────────
// Approximation of the standard normal PDF

export function standardNormalDensity(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
