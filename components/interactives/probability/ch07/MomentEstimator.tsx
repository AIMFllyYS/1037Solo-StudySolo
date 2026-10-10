"use client";

import { memo, useState } from "react";
import { DIST_CONFIGS, parseSamples, momentEstimate, sampleMean, sampleMean2 } from "@/lib/learning/probability/momentEstimation";
import type { DistType } from "@/lib/learning/probability/momentEstimation";
import { getDerivationSteps } from "./MomentEstimator/derivation";
import { buildConvergenceSeries, ConvergenceChart } from "./MomentEstimator/plot";
import { ACCENT, GREEN, ORANGE, ACCENT_LIGHT } from "./MomentEstimator/appearance";
import { ParamSlider } from "./MomentEstimator/controls";
import { fmt, fmt3 } from "./MomentEstimator/formatters";
// ─── 主组件 ──────────────────────────────────────────────────────
function MomentEstimatorBase() {
  const [dist, setDist] = useState<DistType>("exponential");
  const [dataText, setDataText] = useState<string>("2.1, 0.8, 1.5, 0.4, 3.2, 0.6, 1.9, 2.7, 0.3, 1.1");
  const [sampleSize, setSampleSize] = useState<number>(30);
  const [showDerivation, setShowDerivation] = useState<boolean>(true);
  // 真实参数（用于随机生成 & 收敛图）
  const [trueParamsExp, setTrueParamsExp] = useState<number[]>([1.5]);
  const [trueParamsNorm, setTrueParamsNorm] = useState<number[]>([2.0, 1.5]);
  const [trueParamsUnif, setTrueParamsUnif] = useState<number[]>([1.0, 5.0]);
  // 收敛图用的大样本（点击"重新模拟"时更新）
  const [convSample, setConvSample] = useState<number[]>([]);
  const [showConv, setShowConv] = useState<boolean>(false);

  // 当前分布的真实参数
  function getTrueParams(): number[] {
    if (dist === "exponential") return trueParamsExp;
    if (dist === "normal") return trueParamsNorm;
    return trueParamsUnif;
  }

  function setTrueParams(vals: number[]) {
    if (dist === "exponential") setTrueParamsExp(vals);
    else if (dist === "normal") setTrueParamsNorm(vals);
    else setTrueParamsUnif(vals);
  }

  const config = DIST_CONFIGS[dist];
  const trueParams = getTrueParams();

  // 解析当前样本
  const data = parseSamples(dataText);
  const estimate = momentEstimate(dist, data);
  const steps = getDerivationSteps(dist, data, estimate);

  // 样本统计量
  const m1 = sampleMean(data);
  const m2 = sampleMean2(data);
  const b2 = m2 - m1 * m1;

  // 随机生成样本（在事件处理函数内）
  function handleGenerateSample() {
    const sample = config.generateSample(trueParams, sampleSize);
    setDataText(sample.map((v) => v.toFixed(3)).join(", "));
  }

  // 切换分布
  function switchDist(d: DistType) {
    setDist(d);
    setShowConv(false);
    setConvSample([]);
    // 生成默认样本
    const cfg = DIST_CONFIGS[d];
    let tp: number[];
    if (d === "exponential") tp = trueParamsExp;
    else if (d === "normal") tp = trueParamsNorm;
    else tp = trueParamsUnif;
    const sample = cfg.generateSample(tp, 20);
    setDataText(sample.map((v) => v.toFixed(3)).join(", "));
  }

  // 重新模拟收敛过程
  function handleRunConvergence() {
    const bigN = 200;
    const sample = config.generateSample(trueParams, bigN);
    setConvSample(sample);
    setShowConv(true);
  }

  // 收敛图数据
  const convSeries =
    showConv && convSample.length >= 5
      ? buildConvergenceSeries(dist, trueParams, convSample)
      : null;

  // 误差计算（与真实参数对比）
  function computeErrors(): Array<{ label: string; est: number; true_: number; color: string }> {
    if (!data.length) return [];
    if (dist === "exponential") {
      return [{ label: "λ", est: estimate.params.lambda, true_: trueParams[0], color: ACCENT }];
    } else if (dist === "normal") {
      return [
        { label: "μ", est: estimate.params.mu, true_: trueParams[0], color: ACCENT },
        { label: "σ", est: estimate.params.sigma, true_: trueParams[1], color: GREEN },
      ];
    } else {
      return [
        { label: "a", est: estimate.params.a, true_: trueParams[0], color: ACCENT },
        { label: "b", est: estimate.params.b, true_: trueParams[1], color: ORANGE },
      ];
    }
  }

  const errors = computeErrors();

  // 参数滑块颜色
  const sliderColors = [ACCENT, GREEN, ORANGE];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">矩估计量计算器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          选择总体分布，输入样本数据，自动推导矩估计量公式并给出数值估计；
          观察样本量 n 增大时估计量向真实参数收敛的过程。
        </p>
      </div>

      {/* 分布选择 Tab */}
      <div className="flex gap-1.5 flex-wrap">
        {(["exponential", "normal", "uniform"] as DistType[]).map((d) => (
          <button
            key={d}
            onClick={() => switchDist(d)}
            className={
              "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors " +
              (d === dist
                ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                : "border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
            }
          >
            {DIST_CONFIGS[d].label}
          </button>
        ))}
      </div>

      {/* 真实参数（用于生成样本）+ 样本输入 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        <div className="text-[12px] font-semibold text-[var(--ink)]">
          设定真实参数（用于随机生成样本）
        </div>
        {config.trueParamLabels.map((label, i) => (
          <ParamSlider
            key={label}
            label={label}
            value={trueParams[i]}
            min={config.trueParamMin[i]}
            max={config.trueParamMax[i]}
            step={config.trueParamStep[i]}
            onChange={(v) => {
              const next = [...trueParams];
              next[i] = v;
              // 强制均匀分布 a < b
              if (dist === "uniform") {
                if (i === 0 && v >= next[1]) next[1] = v + 0.5;
                if (i === 1 && v <= next[0]) next[0] = v - 0.5;
              }
              setTrueParams(next);
            }}
            color={sliderColors[i]}
          />
        ))}

        {/* 样本量 & 生成按钮 */}
        <div className="flex items-center gap-3 pt-1">
          <span className="w-20 shrink-0 text-[12px] font-semibold text-[var(--ink)]">样本量 n</span>
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="flex-1 h-1.5 cursor-pointer"
            style={{ accentColor: ACCENT }}
          />
          <span
            className="w-14 shrink-0 rounded-md px-2 py-0.5 text-center text-[12px] font-mono font-bold"
            style={{ background: ACCENT_LIGHT, color: ACCENT }}
          >
            {sampleSize}
          </span>
        </div>
        <button
          onClick={handleGenerateSample}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          随机生成样本
        </button>
      </div>

      {/* 样本数据文本框 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            样本数据（逗号分隔）
            {data.length > 0 && (
              <span className="ml-2 font-normal text-[var(--ink-soft)]">
                n = {data.length}
              </span>
            )}
          </span>
          {data.length === 0 && dataText.trim() !== "" && (
            <span className="text-[11px] text-red-500">格式有误，请检查</span>
          )}
        </div>
        <textarea
          value={dataText}
          onChange={(e) => setDataText(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] font-mono text-[var(--ink)] placeholder-[var(--ink-soft)] focus:outline-none focus:border-[var(--accent)] resize-none"
          placeholder="输入样本值，逗号/空格分隔"
          spellCheck={false}
        />
      </div>

      {/* 样本统计量 */}
      {data.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "一阶样本矩 x̄",
              val: fmt(m1),
              sub: "(1/n)·Σxᵢ",
              color: ACCENT,
            },
            {
              label: "二阶样本矩 B₂",
              val: fmt(m2),
              sub: "(1/n)·Σxᵢ²",
              color: GREEN,
            },
            {
              label: "样本方差 B₂−x̄²",
              val: fmt(b2),
              sub: "= σ̂² (矩估计)",
              color: ORANGE,
            },
          ].map(({ label, val, sub, color }) => (
            <div
              key={label}
              className="rounded-lg p-2.5 text-center"
              style={{ background: color + "15", border: `1px solid ${color}30` }}
            >
              <div className="text-[10px] text-[var(--ink-soft)] leading-snug">{label}</div>
              <div className="text-[15px] font-extrabold font-mono mt-0.5" style={{ color }}>
                {val}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)]">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* 矩估计推导步骤 */}
      {data.length > 0 && (
        <div className="rounded-lg border border-[var(--line)] overflow-hidden">
          <button
            onClick={() => setShowDerivation((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--bg-muted)] text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors"
          >
            <span>矩估计推导过程</span>
            <span className="text-[var(--ink-soft)] text-[11px]">
              {showDerivation ? "收起 ▲" : "展开 ▼"}
            </span>
          </button>

          {showDerivation && (
            <div className="divide-y divide-[var(--line)]">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-3 px-4 py-3 items-start"
                  style={{
                    background: step.color ? step.color + "08" : undefined,
                  }}
                >
                  <span
                    className="shrink-0 text-[11px] font-semibold mt-0.5"
                    style={{ color: step.color ?? "var(--ink-soft)" }}
                  >
                    {step.label}
                  </span>
                  <span
                    className="font-mono text-[12px] leading-relaxed break-all"
                    style={{ color: step.color ?? "var(--ink)" }}
                  >
                    {step.math}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 矩估计结果 vs 真实参数 */}
      {data.length > 0 && errors.length > 0 && (
        <div
          className="rounded-lg border-2 p-4 space-y-3"
          style={{ borderColor: ACCENT, background: ACCENT_LIGHT }}
        >
          <div className="text-[13px] font-bold text-[var(--ink)]">矩估计结果对比</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${errors.length}, 1fr)` }}>
            {errors.map(({ label, est, true_, color }) => (
              <div
                key={label}
                className="rounded-lg p-3 text-center"
                style={{ background: "var(--bg-elevated)", border: `1.5px solid ${color}40` }}
              >
                <div className="text-[10px] text-[var(--ink-soft)]">参数 {label}</div>
                <div className="text-[20px] font-extrabold font-mono mt-0.5" style={{ color }}>
                  {fmt3(est)}
                </div>
                <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                  矩估计 {label}̂
                </div>
                {isFinite(true_) && (
                  <div
                    className="mt-1 text-[10px] font-mono rounded px-1.5 py-0.5"
                    style={{
                      background: Math.abs(est - true_) < 0.1 ? "rgb(16 185 129 / 0.12)" : "rgb(245 158 11 / 0.14)",
                      color: Math.abs(est - true_) < 0.1 ? "var(--color-success)" : "var(--color-warning)",
                    }}
                  >
                    真值 {true_.toFixed(3)}｜误差 {Math.abs(est - true_).toFixed(3)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">
            矩估计的理论保证：当样本量 n → ∞ 时，由大数定律，样本矩依概率收敛于总体矩，从而矩估计量也收敛于真实参数（一致估计量）。
          </p>
        </div>
      )}

      {/* 收敛性演示 */}
      <div className="rounded-lg border border-[var(--line)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-muted)]">
          <div>
            <span className="text-[13px] font-semibold text-[var(--ink)]">收敛性演示</span>
            <span className="ml-2 text-[11px] text-[var(--ink-soft)]">
              n 增大时矩估计量趋近真实参数
            </span>
          </div>
          <button
            onClick={handleRunConvergence}
            className="rounded-lg bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
          >
            {showConv ? "重新模拟" : "开始模拟"}
          </button>
        </div>

        {showConv && convSeries ? (
          <div className="p-3 space-y-2">
            <ConvergenceChart series={convSeries} />
            <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed px-1">
              虚线为真实参数值，实线为矩估计量随 n 的变化。随着样本量增大，
              矩估计量的波动越来越小并趋近于真值——这正是矩估计一致性的直观体现。
            </p>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-[12px] text-[var(--ink-soft)]">
            点击「开始模拟」生成 200 个样本，观察矩估计量随 n 变化的收敛过程
          </div>
        )}
      </div>

      {/* 直觉说明 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">矩估计核心思想：</span>
        用<strong className="text-[var(--ink)]">样本矩</strong>替换<strong className="text-[var(--ink)]">总体矩</strong>。
        总体 k 阶矩 μₖ = E[Xᵏ] 是参数 θ 的函数；将其替换为样本 k 阶矩
        Bₖ = (1/n)·Σxᵢᵏ，反解出参数即为矩估计量 θ̂。
        方法简单、直观，但当总体分布的高阶矩需要用时，估计精度可能不如极大似然估计。
      </div>
    </div>
  );
}

export default memo(MomentEstimatorBase);