// ─── 数学工具 ────────────────────────────────────────────────────────────────

/** log-阶乘（避免大 n 时数值溢出） */
function logFactorial(n: number): number {
  let r = 0;
  for (let i = 2; i <= n; i++) r += Math.log(i);
  return r;
}

/** 二项分布 P(X=k) = C(n,k) * p^k * (1-p)^(n-k) */
export function binomPMF(n: number, p: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  const logP =
    logFactorial(n) -
    logFactorial(k) -
    logFactorial(n - k) +
    k * Math.log(p) +
    (n - k) * Math.log(1 - p);
  return Math.exp(logP);
}

/** 泊松分布 P(X=k) = e^{-λ} * λ^k / k! */
export function poissonPMF(lambda: number, k: number): number {
  if (k < 0) return 0;
  const logP = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logP);
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export type TabType = "binomial" | "poisson";