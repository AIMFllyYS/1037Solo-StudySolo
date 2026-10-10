import { useState } from "react";
import type { TestType, TailType, TestResult, AlphaLevel } from "@/lib/learning/probability/meanTest";
import { ACCENT, RED_LIGHT, GREEN_LIGHT, RED, GREEN } from "./appearance";
// ─── Derivation panel ─────────────────────────────────────────────────────
export interface DerivationProps {
  testType: TestType;
  tail: TailType;
  xbar: number;
  mu0: number;
  spread: number;
  n: number;
  result: TestResult;
  alpha: AlphaLevel;
}

export function Derivation({ testType, tail, xbar, mu0, spread, n, result, alpha }: DerivationProps) {
  const [open, setOpen] = useState(false);
  const df = n - 1;
  const se = spread / Math.sqrt(n);
  const stat = result.statistic;
  const spreadSymbol = testType === "z" ? "σ" : "S";
  const statSymbol = testType === "z" ? "Z" : "T";

  const tailLabel =
    tail === "left" ? "左尾检验 H₁: μ < μ₀" : tail === "right" ? "右尾检验 H₁: μ > μ₀" : "双尾检验 H₁: μ ≠ μ₀";

  return (
    <div className="rounded-lg border border-[var(--line)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 bg-[var(--bg-muted)] text-left"
      >
        <span className="text-[13px] font-semibold text-[var(--ink)]">推导步骤展开</span>
        <span className="text-[16px] text-[var(--ink-soft)]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 1：建立假设</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              H₀: μ = {mu0}{"　"}|{"　"}{tailLabel}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 2：计算标准误</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              SE = {spreadSymbol}/√n = {spread}/{Math.sqrt(n).toFixed(4)} = {se.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">
              Step 3：计算检验统计量
              {testType === "t" && `（t 分布，df = n−1 = ${df}）`}
            </div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              {statSymbol} = (X̄ − μ₀) / SE{"\n"}
              {"　　"}= ({xbar} − {mu0}) / {se.toFixed(4)}{"\n"}
              {"　　"}= {(xbar - mu0).toFixed(4)} / {se.toFixed(4)}{"\n"}
              {"　　"}= <span style={{ color: ACCENT, fontWeight: 700 }}>{stat.toFixed(4)}</span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 4：确定临界值与拒绝域</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              显著性水平 α = {alpha}{"　"}
              {tail === "left" && `临界值 = ${result.criticalHigh.toFixed(4)}（左尾）`}
              {tail === "right" && `临界值 = ${result.criticalLow.toFixed(4)}（右尾）`}
              {tail === "two" && `临界值 = ±${Math.abs(result.criticalHigh).toFixed(4)}（双尾）`}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 5：计算 p 值</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              {tail === "left" && `p = P(${statSymbol} ≤ ${stat.toFixed(4)}) = `}
              {tail === "right" && `p = P(${statSymbol} ≥ ${stat.toFixed(4)}) = `}
              {tail === "two" && `p = 2 × P(${statSymbol} ≥ |${stat.toFixed(4)}|) = `}
              <span style={{ color: ACCENT, fontWeight: 700 }}>{result.pValue.toFixed(4)}</span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 6：作出结论</div>
            <div
              className="rounded px-3 py-2 font-semibold"
              style={{
                background: result.reject ? RED_LIGHT : GREEN_LIGHT,
                color: result.reject ? RED : GREEN,
              }}
            >
              {result.reject
                ? `p = ${result.pValue.toFixed(4)} < α = ${alpha}，拒绝 H₀`
                : `p = ${result.pValue.toFixed(4)} ≥ α = ${alpha}，不拒绝 H₀`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}