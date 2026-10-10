import type { DistType } from "@/lib/learning/probability/estimation/likelihood";
// ─── 辅助：数值精度格式化 ─────────────────────────────────────────
export function fmt(v: number, d = 4): string {
  return v.toFixed(d);
}

// ─── MLE 公式文字 ─────────────────────────────────────────────────
export function mleFormula(dist: DistType, data: number[], mle: number): string {
  if (dist === "exponential") {
    const n = data.length;
    const sumX = data.reduce((s, x) => s + x, 0).toFixed(4);
    const mean = (parseFloat(sumX) / n).toFixed(4);
    return `θ̂ = λ̂ = n / Σxᵢ = ${n} / ${sumX} = 1 / x̄ = 1 / ${mean} = ${fmt(mle)}`;
  } else {
    const n = data.length;
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    return `θ̂ = p̂ = k / n = ${k} / ${n} = ${fmt(mle)}`;
  }
}