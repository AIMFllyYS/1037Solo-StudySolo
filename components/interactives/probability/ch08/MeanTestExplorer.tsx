"use client";

import { memo, useState } from "react";
import { computeTest } from "@/lib/learning/probability/meanTest";
import type { TestType, TailType, AlphaLevel } from "@/lib/learning/probability/meanTest";
import { NumInput, Slider } from "./MeanTestExplorer/controls";
import { ACCENT, RED, GREEN, RED_LIGHT, GREEN_LIGHT } from "./MeanTestExplorer/appearance";
import { DistSVG } from "./MeanTestExplorer/plot";
import { Derivation } from "./MeanTestExplorer/derivation";
// ─── Main component ───────────────────────────────────────────────────────
function MeanTestExplorerBase() {
  // Tab
  const [testType, setTestType] = useState<TestType>("z");

  // Inputs
  const [xbar, setXbar] = useState(102.5);
  const [mu0, setMu0] = useState(100);
  const [sigma, setSigma] = useState(10);   // Z test: known σ
  const [s, setS] = useState(10);           // t test: sample std dev S
  const [n, setN] = useState(25);

  // Test settings
  const [tail, setTail] = useState<TailType>("two");
  const [alpha, setAlpha] = useState<AlphaLevel>(0.05);

  const spread = testType === "z" ? sigma : s;
  const df = n - 1;

  // Validation
  const valid = n >= 2 && spread > 0;

  const result = valid
    ? computeTest(xbar, mu0, spread, n, tail, alpha, testType)
    : null;

  const tailOptions: { key: TailType; label: string; symbol: string }[] = [
    { key: "left", label: "左尾", symbol: "H₁: μ < μ₀" },
    { key: "two", label: "双尾", symbol: "H₁: μ ≠ μ₀" },
    { key: "right", label: "右尾", symbol: "H₁: μ > μ₀" },
  ];

  const alphaOptions: AlphaLevel[] = [0.01, 0.05, 0.1];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">正态总体均值假设检验</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          输入样本统计量，选择检验方向与显著性水平，实时计算统计量、p 值与结论。
        </p>
      </div>

      {/* Test type tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--bg-muted)] p-1">
        {(["z", "t"] as TestType[]).map((tp) => (
          <button
            key={tp}
            onClick={() => setTestType(tp)}
            className={`flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors ${
              testType === tp
                ? "bg-[var(--bg-elevated)] shadow text-[var(--ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            {tp === "z" ? "Z 检验（σ 已知）" : "t 检验（σ 未知）"}
          </button>
        ))}
      </div>

      {/* Parameter inputs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 rounded-lg bg-[var(--bg-muted)] p-3">
        <NumInput
          label="样本均值 X̄"
          value={xbar}
          min={-1000}
          max={1000}
          step={0.1}
          onChange={setXbar}
        />
        <NumInput
          label="原假设均值 μ₀"
          value={mu0}
          min={-1000}
          max={1000}
          step={0.1}
          onChange={setMu0}
        />
        <NumInput
          label="样本量 n"
          value={n}
          min={2}
          max={10000}
          step={1}
          onChange={setN}
        />
        {testType === "z" ? (
          <NumInput
            label="总体标准差 σ（已知）"
            value={sigma}
            min={0.001}
            max={1000}
            step={0.1}
            onChange={setSigma}
          />
        ) : (
          <NumInput
            label="样本标准差 S"
            value={s}
            min={0.001}
            max={1000}
            step={0.1}
            onChange={setS}
          />
        )}

        {/* Sliders section */}
        <div className="col-span-2 sm:col-span-2">
          <Slider
            label="样本量 n（快速调整）"
            value={n}
            min={2}
            max={200}
            step={1}
            onChange={setN}
            fmt={(v) => `n = ${v}`}
          />
        </div>
      </div>

      {/* Test direction and alpha */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tail direction */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-semibold text-[var(--ink)]">检验方向</div>
          <div className="flex flex-col gap-1">
            {tailOptions.map(({ key, label, symbol }) => (
              <button
                key={key}
                onClick={() => setTail(key)}
                className={`rounded-lg px-3 py-1.5 text-left text-[12px] font-medium transition-colors ${
                  tail === key
                    ? "text-[var(--md-sys-color-on-primary)]"
                    : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]"
                }`}
                style={tail === key ? { background: ACCENT } : {}}
              >
                <span className="font-semibold">{label}</span>
                <span className="ml-2 font-mono text-[11px] opacity-80">{symbol}</span>
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
                    ? "text-[var(--md-sys-color-on-primary)]"
                    : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]"
                }`}
                style={alpha === a ? { background: ACCENT } : {}}
              >
                α = {a}
              </button>
            ))}
          </div>

          {/* Quick formula */}
          <div className="mt-2 rounded-md bg-[var(--bg-muted)] px-2 py-1.5 text-[11px] leading-snug text-[var(--ink-soft)]">
            {testType === "z" ? (
              <>
                <span className="font-semibold text-[var(--ink)]">Z 统计量</span>
                <br />
                Z = (X̄ − μ₀) / (σ / √n)
                <br />
                服从 N(0,1)
              </>
            ) : (
              <>
                <span className="font-semibold text-[var(--ink)]">T 统计量</span>
                <br />
                T = (X̄ − μ₀) / (S / √n)
                <br />
                服从 t(n−1) = t({df})
              </>
            )}
          </div>
        </div>
      </div>

      {/* Distribution visualization */}
      {result && (
        <DistSVG result={result} tail={tail} type={testType} df={df} />
      )}

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
              {result.reject ? "显著" : "不显著"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: testType === "z" ? "Z 值" : "T 值",
                val: result.statistic.toFixed(4),
                color: result.reject ? RED : ACCENT,
              },
              {
                label: "p 值",
                val: result.pValue < 0.0001 ? "< 0.0001" : result.pValue.toFixed(4),
                color: result.pValue < alpha ? RED : GREEN,
              },
              {
                label: tail === "left" ? "左临界值" : tail === "right" ? "右临界值" : "临界值 ±",
                val:
                  tail === "two"
                    ? Math.abs(result.criticalHigh).toFixed(4)
                    : tail === "left"
                    ? result.criticalHigh.toFixed(4)
                    : result.criticalLow.toFixed(4),
                color: RED,
              },
              {
                label: "df",
                val: testType === "t" ? String(df) : "∞（Z）",
                color: ACCENT,
              },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-lg bg-white bg-opacity-70 p-2 text-center">
                <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
                <div className="text-[15px] font-extrabold font-mono mt-0.5" style={{ color }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[12px] leading-relaxed" style={{ color: result.reject ? RED : GREEN }}>
            {result.reject ? (
              <>
                在 α = {alpha} 水平下，p = {result.pValue.toFixed(4)} {"<"} {alpha}，有统计上的显著差异，
                有足够证据拒绝 H₀，认为总体均值与 μ₀ = {mu0} 有显著差异。
              </>
            ) : (
              <>
                在 α = {alpha} 水平下，p = {result.pValue.toFixed(4)} {"≥"} {alpha}，
                没有足够证据拒绝 H₀，无法认为总体均值与 μ₀ = {mu0} 有显著差异。
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
            <span>α = {alpha}</span>
          </div>
          <div className="relative h-5 w-full rounded-full overflow-hidden" style={{ background: GREEN_LIGHT }}>
            {/* Alpha threshold marker */}
            <div
              className="absolute top-0 h-full w-0.5"
              style={{ left: `${alpha * 100}%`, background: RED }}
            />
            {/* p value fill */}
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(result.pValue, 1) * 100}%`,
                background: result.reject ? RED : GREEN,
                opacity: 0.5,
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
          testType={testType}
          tail={tail}
          xbar={xbar}
          mu0={mu0}
          spread={spread}
          n={n}
          result={result}
          alpha={alpha}
        />
      )}

      {/* Educational insight */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">核心思想：</span>
        假设检验问题的本质是「若 H₀ 为真，观察到当前或更极端数据的概率（p 值）有多小？」。
        p 值越小，越有证据反对 H₀。Z 检验需要已知 σ；当 σ 未知且用样本 S 估计时，
        统计量服从 t 分布——样本量越小（df 越小），t 分布尾部越重，临界值越大。
      </div>
    </div>
  );
}

export default memo(MeanTestExplorerBase);