import { useState } from "react";
import type { TailType, AlphaLevel, TestResult } from "@/lib/learning/probability/varianceTest";
import { ACCENT, RED_LIGHT, GREEN_LIGHT, RED, GREEN } from "./appearance";
// ─── Derivation steps panel ───────────────────────────────────────────────────
export interface DerivationProps {
  s2: number;
  n: number;
  sigma02: number;
  tail: TailType;
  alpha: AlphaLevel;
  result: TestResult;
}

export function Derivation({ s2, n, sigma02, tail, alpha, result }: DerivationProps) {
  const [open, setOpen] = useState(false);
  const { df, chi2Stat, pValue, criticalLow, criticalHigh, reject } = result;

  const h1Label =
    tail === "left"
      ? "H₁: σ² < σ₀²"
      : tail === "right"
      ? "H₁: σ² > σ₀²"
      : "H₁: σ² ≠ σ₀²";

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
              H₀: σ² = σ₀² = {sigma02}{"　"}|{"　"}{h1Label}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 2：确认检验条件</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              正态总体，方差待检验{"\n"}
              在 H₀ 下，统计量 χ² = (n−1)S²/σ₀² 服从 χ²(n−1){"\n"}
              自由度 df = n − 1 = {n} − 1 = {df}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 3：计算 χ² 统计量</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              χ² = (n−1) × S² / σ₀²{"\n"}
              {"　　"}= {df} × {s2} / {sigma02}{"\n"}
              {"　　"}= {(df * s2).toFixed(4)} / {sigma02}{"\n"}
              {"　　"}= <span style={{ color: ACCENT, fontWeight: 700 }}>{chi2Stat.toFixed(4)}</span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 4：确定临界值与拒绝域</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              显著性水平 α = {alpha}，df = {df}{"\n"}
              {tail === "left" && (
                `拒绝域：χ² < χ²α(${df}) = ${criticalHigh.toFixed(4)}（左尾）`
              )}
              {tail === "right" && (
                `拒绝域：χ² > χ²1-α(${df}) = ${criticalLow.toFixed(4)}（右尾）`
              )}
              {tail === "two" && (
                `拒绝域：χ² < ${criticalLow.toFixed(4)} 或 χ² > ${criticalHigh.toFixed(4)}（双尾）`
              )}
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 5：计算 p 值</div>
            <div className="font-mono bg-[var(--bg-muted)] rounded px-3 py-2">
              {tail === "left" && `p = P(χ²(${df}) ≤ ${chi2Stat.toFixed(4)}) = `}
              {tail === "right" && `p = P(χ²(${df}) ≥ ${chi2Stat.toFixed(4)}) = `}
              {tail === "two" && `p = 2 × min{P(χ²(${df}) ≤ χ²), P(χ²(${df}) ≥ χ²)} = `}
              <span style={{ color: ACCENT, fontWeight: 700 }}>{pValue.toFixed(4)}</span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1">Step 6：作出结论</div>
            <div
              className="rounded px-3 py-2 font-semibold"
              style={{
                background: reject ? RED_LIGHT : GREEN_LIGHT,
                color: reject ? RED : GREEN,
              }}
            >
              {reject
                ? `p = ${pValue.toFixed(4)} < α = ${alpha}，拒绝 H₀，认为方差与 σ₀² 有显著差异`
                : `p = ${pValue.toFixed(4)} ≥ α = ${alpha}，不拒绝 H₀，无证据表明方差有显著变化`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}