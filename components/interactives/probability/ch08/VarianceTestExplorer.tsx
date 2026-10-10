"use client";

import { memo, useState } from "react";
import { computeVarianceTest } from "@/lib/learning/probability/varianceTest";
import type { TailType, AlphaLevel } from "@/lib/learning/probability/varianceTest";
import { NumInput, Slider } from "./VarianceTestExplorer/controls";
import { ACCENT, RED, GREEN, RED_LIGHT, GREEN_LIGHT } from "./VarianceTestExplorer/appearance";
import { DistSVG } from "./VarianceTestExplorer/plot";
import { Derivation } from "./VarianceTestExplorer/derivation";
// ─── Main Component ───────────────────────────────────────────────────────────
function VarianceTestExplorerBase() {
  // Parameter inputs
  const [s2, setS2] = useState(1.44);        // sample variance S²
  const [n, setN] = useState(16);             // sample size
  const [sigma02, setSigma02] = useState(1);  // hypothesized variance σ₀²
  const [tail, setTail] = useState<TailType>("two");
  const [alpha, setAlpha] = useState<AlphaLevel>(0.05);

  // Validation
  const valid = n >= 2 && s2 > 0 && sigma02 > 0;

  const result = valid ? computeVarianceTest(s2, n, sigma02, tail, alpha) : null;

  const tailOptions: { key: TailType; label: string; h1: string }[] = [
    { key: "left", label: "左尾", h1: "H₁: σ² < σ₀²" },
    { key: "two", label: "双尾", h1: "H₁: σ² ≠ σ₀²" },
    { key: "right", label: "右尾", h1: "H₁: σ² > σ₀²" },
  ];

  const alphaOptions: AlphaLevel[] = [0.01, 0.05, 0.1];

  // p-value bar display
  const pBarWidth = result ? Math.min(result.pValue, 1) * 100 : 0;
  const alphaPos = alpha * 100;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">正态总体方差假设检验（χ² 检验）</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          输入样本方差 S²、样本量 n、原假设方差 σ₀²，实时计算 χ² 统计量与检验结论。
        </p>
      </div>

      {/* Formula reminder */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-[12px] text-[var(--ink-soft)]">
        <span className="font-semibold text-[var(--ink)]">统计量：</span>
        <span className="font-mono ml-1">χ² = (n−1)S² / σ₀²</span>
        <span className="ml-2 text-[11px]">在 H₀ 下服从 χ²(n−1)</span>
      </div>

      {/* Parameter inputs */}
      <div className="rounded-lg bg-[var(--bg-muted)] p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <NumInput
            label="样本方差 S²"
            value={s2}
            min={0.001}
            max={100}
            step={0.01}
            onChange={setS2}
          />
          <NumInput
            label="假设方差 σ₀²"
            value={sigma02}
            min={0.001}
            max={100}
            step={0.01}
            onChange={setSigma02}
          />
          <NumInput
            label="样本量 n"
            value={n}
            min={2}
            max={500}
            step={1}
            onChange={setN}
          />
        </div>

        {/* Quick slider for S²/σ₀² ratio */}
        <Slider
          label="S²/σ₀² 比值（快速调整）"
          value={parseFloat((s2 / sigma02).toFixed(3))}
          min={0.05}
          max={10}
          step={0.05}
          onChange={(ratio) => setS2(parseFloat((ratio * sigma02).toFixed(4)))}
          fmt={(v) => `${v.toFixed(2)}x`}
        />
        <Slider
          label="样本量 n（快速调整）"
          value={n}
          min={2}
          max={100}
          step={1}
          onChange={setN}
          fmt={(v) => `n = ${v}, df = ${v - 1}`}
        />
      </div>

      {/* Test direction and alpha */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tail direction */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-semibold text-[var(--ink)]">检验方向</div>
          <div className="flex flex-col gap-1">
            {tailOptions.map(({ key, label, h1 }) => (
              <button
                key={key}
                onClick={() => setTail(key)}
                className={`rounded-lg px-3 py-1.5 text-left text-[12px] font-medium transition-colors ${
                  tail === key
                    ? "text-white"
                    : "bg-[var(--bg-elevated)] border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
                }`}
                style={tail === key ? { background: ACCENT } : {}}
              >
                <span className="font-semibold">{label}</span>
                <span className="ml-2 font-mono text-[11px] opacity-80">{h1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alpha level */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-semibold text-[var(--ink)]">显著性水平 α</div>
          <div className="flex flex-col gap-1">
            {alphaOptions.map((a) => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-mono font-semibold transition-colors ${
                  alpha === a
                    ? "text-white"
                    : "bg-[var(--bg-elevated)] border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
                }`}
                style={alpha === a ? { background: ACCENT } : {}}
              >
                α = {a}
              </button>
            ))}
          </div>

          {/* Quick info */}
          <div className="rounded-md bg-[var(--bg-muted)] px-2 py-1.5 text-[11px] leading-snug text-[var(--ink-soft)]">
            <span className="font-semibold text-[var(--ink)]">当前参数</span>
            <br />
            S² / σ₀² = {sigma02 > 0 ? (s2 / sigma02).toFixed(3) : "—"}
            <br />
            df = n−1 = {n - 1}
            {result && (
              <>
                <br />
                χ² ={" "}
                <span className="font-bold" style={{ color: result.reject ? RED : ACCENT }}>
                  {result.chi2Stat.toFixed(4)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Distribution SVG */}
      {result && <DistSVG result={result} tail={tail} />}

      {/* Result panel */}
      {result && (
        <div
          className="rounded-lg border-2 p-4 space-y-3"
          style={{
            borderColor: result.reject ? RED : GREEN,
            background: result.reject ? RED_LIGHT : GREEN_LIGHT,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold" style={{ color: result.reject ? RED : GREEN }}>
              {result.reject ? "拒绝 H₀" : "不拒绝 H₀"}
            </span>
            <span
              className="rounded-full px-3 py-0.5 text-[12px] font-bold text-white"
              style={{ background: result.reject ? RED : GREEN }}
            >
              {result.reject ? "方差显著变化" : "方差无显著变化"}
            </span>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: "χ² 统计量",
                val: result.chi2Stat.toFixed(4),
                color: result.reject ? RED : ACCENT,
              },
              {
                label: "p 值",
                val: result.pValue < 0.0001 ? "< 0.0001" : result.pValue.toFixed(4),
                color: result.pValue < alpha ? RED : GREEN,
              },
              {
                label:
                  tail === "left"
                    ? "左临界值 χ²α"
                    : tail === "right"
                    ? "右临界值 χ²1-α"
                    : "临界值（双）",
                val:
                  tail === "left"
                    ? result.criticalHigh.toFixed(4)
                    : tail === "right"
                    ? result.criticalLow.toFixed(4)
                    : `${result.criticalLow.toFixed(3)} / ${result.criticalHigh.toFixed(3)}`,
                color: RED,
              },
              {
                label: "自由度 df",
                val: String(result.df),
                color: ACCENT,
              },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-lg bg-white bg-opacity-70 p-2 text-center">
                <div className="text-[10px] text-[var(--ink-soft)] leading-snug">{label}</div>
                <div
                  className="text-[13px] font-extrabold font-mono mt-0.5 break-all"
                  style={{ color }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Conclusion text */}
          <div
            className="text-[12px] leading-relaxed"
            style={{ color: result.reject ? RED : GREEN }}
          >
            {result.reject ? (
              <>
                在 α = {alpha} 水平下，p = {result.pValue.toFixed(4)} &lt; {alpha}，
                有统计上的显著证据拒绝 H₀，认为总体方差与 σ₀² = {sigma02} 有显著差异。
              </>
            ) : (
              <>
                在 α = {alpha} 水平下，p = {result.pValue.toFixed(4)} ≥ {alpha}，
                没有足够证据拒绝 H₀，无法认为总体方差与 σ₀² = {sigma02} 有显著差异。
              </>
            )}
          </div>
        </div>
      )}

      {/* p-value bar visualization */}
      {result && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--ink-soft)]">
            <span>p 值直观位置</span>
            <span style={{ color: RED }}>α = {alpha}</span>
          </div>
          <div
            className="relative h-5 w-full rounded-full overflow-hidden"
            style={{ background: GREEN_LIGHT }}
          >
            {/* Alpha threshold line */}
            <div
              className="absolute top-0 h-full w-0.5"
              style={{ left: `${alphaPos}%`, background: RED, zIndex: 2 }}
            />
            {/* p value fill */}
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pBarWidth}%`,
                background: result.reject ? RED : GREEN,
                opacity: 0.55,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
            <span>0</span>
            <span style={{ color: RED }}>α = {alpha}</span>
            <span>1</span>
          </div>
        </div>
      )}

      {/* Derivation steps */}
      {result && (
        <Derivation
          s2={s2}
          n={n}
          sigma02={sigma02}
          tail={tail}
          alpha={alpha}
          result={result}
        />
      )}

      {/* Preset examples */}
      <div className="space-y-1.5">
        <div className="text-[12px] font-semibold text-[var(--ink)]">典型场景快速加载</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "方差增大（右尾）", s2: 2, n: 20, sigma02: 1, tail: "right" as TailType, desc: "S²=2, n=20, σ₀²=1" },
            { label: "方差缩小（左尾）", s2: 0.3, n: 16, sigma02: 1, tail: "left" as TailType, desc: "S²=0.3, n=16, σ₀²=1" },
            { label: "双侧检验（无差异）", s2: 1.1, n: 30, sigma02: 1, tail: "two" as TailType, desc: "S²=1.1, n=30, σ₀²=1" },
            { label: "小样本强信号", s2: 5, n: 8, sigma02: 1, tail: "two" as TailType, desc: "S²=5, n=8, σ₀²=1" },
          ].map(({ label, s2: ps2, n: pn, sigma02: psg, tail: ptail, desc }) => (
            <button
              key={label}
              onClick={() => {
                setS2(ps2);
                setN(pn);
                setSigma02(psg);
                setTail(ptail);
              }}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-left text-[11px] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--md-sys-color-on-primary)] transition-colors"
            >
              <div className="font-semibold">{label}</div>
              <div className="opacity-70 font-mono">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Educational insight */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">核心思想：</span>
        方差检验的关键是统计量{" "}
        <span className="font-mono text-[var(--ink)]">χ² = (n−1)S²/σ₀²</span>{" "}
        在 H₀ 为真时服从 χ² 分布。χ² 分布是非负的、右偏分布，均值为 df，方差为 2·df。
        当 S² 比 σ₀² 大得多时，χ² 值会落入右侧拒绝域；比 σ₀² 小得多时落入左侧。
        增大样本量 n 使分布更集中（均值不变，但峰更尖），临界值之间差距缩小，检验功效提升。
      </div>
    </div>
  );
}

export default memo(VarianceTestExplorerBase);