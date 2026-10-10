import { sampleMean, sampleMean2 } from "@/lib/learning/probability/momentEstimation";
import type { DistType, EstimateResult } from "@/lib/learning/probability/momentEstimation";
import { ACCENT, GREEN } from "./appearance";
import { fmt } from "./formatters";
// ─── 矩估计步骤文字 ────────────────────────────────────────────────
export interface DerivationStep {
  label: string;
  math: string;
  color?: string;
}

export function getDerivationSteps(
  dist: DistType,
  data: number[],
  estimate: EstimateResult
): DerivationStep[] {
  if (data.length === 0) return [];

  const m1 = sampleMean(data);
  const m2 = sampleMean2(data);
  const b2 = m2 - m1 * m1;

  if (dist === "exponential") {
    const lambda = estimate.params.lambda;
    return [
      {
        label: "① 总体一阶矩",
        math: `E[X] = ∫₀^∞ x·λe^{-λx} dx = 1/λ`,
      },
      {
        label: "② 令总体矩 = 样本矩",
        math: `E[X] = x̄   →   1/λ = x̄`,
      },
      {
        label: "③ 解出矩估计量",
        math: `λ̂ = 1 / x̄`,
        color: ACCENT,
      },
      {
        label: "④ 代入样本数值",
        math: `x̄ = ${fmt(m1)}   →   λ̂ = 1 / ${fmt(m1)} = ${fmt(lambda)}`,
        color: GREEN,
      },
    ];
  } else if (dist === "normal") {
    const { mu, sigma2, sigma } = estimate.params;
    return [
      {
        label: "① 总体一、二阶矩",
        math: `E[X] = μ,   E[X²] = D(X) + (E[X])² = σ² + μ²`,
      },
      {
        label: "② 令总体矩 = 样本矩",
        math: `μ = x̄,   σ² + μ² = B₂ = (1/n)·Σxᵢ²`,
      },
      {
        label: "③ 解出矩估计量",
        math: `μ̂ = x̄,   σ̂² = B₂ − x̄² = (1/n)·Σxᵢ² − x̄²`,
        color: ACCENT,
      },
      {
        label: "④ 代入数值（n=" + data.length + "）",
        math: `x̄ = ${fmt(m1)},  B₂ = ${fmt(m2)},  σ̂² = ${fmt(sigma2)},  σ̂ = ${fmt(sigma)}`,
        color: GREEN,
      },
      {
        label: "⑤ 矩估计结果",
        math: `μ̂ = ${fmt(mu, 3)},   σ̂ = ${fmt(sigma, 3)}`,
        color: GREEN,
      },
    ];
  } else {
    // uniform
    const { a, b } = estimate.params;
    return [
      {
        label: "① 总体一、二阶矩",
        math: `E[X] = (a+b)/2,   D(X) = (b−a)²/12`,
      },
      {
        label: "② 总体二阶矩",
        math: `E[X²] = D(X)+(E[X])² = (b−a)²/12 + (a+b)²/4`,
      },
      {
        label: "③ 令总体矩 = 样本矩",
        math: `(a+b)/2 = x̄,   (b−a)²/12 = B₂−x̄²`,
      },
      {
        label: "④ 解方程组",
        math: `b−a = √(12·(B₂−x̄²)),   a+b = 2x̄`,
        color: ACCENT,
      },
      {
        label: "⑤ 矩估计量",
        math: `â = x̄ − √(3·(B₂−x̄²)),   b̂ = x̄ + √(3·(B₂−x̄²))`,
        color: ACCENT,
      },
      {
        label: "⑥ 代入数值",
        math: `x̄=${fmt(m1)}, B₂−x̄²=${fmt(b2)}, √(3·${fmt(b2)})=${fmt(Math.sqrt(Math.max(0,3*b2)))}`,
        color: GREEN,
      },
      {
        label: "⑦ 结果",
        math: `â = ${fmt(a, 3)},   b̂ = ${fmt(b, 3)}`,
        color: GREEN,
      },
    ];
  }
}