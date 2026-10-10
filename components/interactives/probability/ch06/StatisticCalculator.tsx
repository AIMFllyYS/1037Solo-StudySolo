"use client";

import { memo, useState, useCallback, useId } from "react";
import { calcStats, randNormal } from "@/lib/learning/probability/sampling/statistics";
import type { Stats } from "@/lib/learning/probability/sampling/statistics";
import { GRAY_LINE, ACCENT, ORANGE, GREEN, ACCENT_LIGHT, GREEN_LIGHT } from "./StatisticCalculator/appearance";
import { NumberLine } from "./StatisticCalculator/plot";
import { StepCard } from "./StatisticCalculator/controls";
import { fmt } from "./StatisticCalculator/formatters";
// ─── 主组件 ───────────────────────────────────────────────────
function StatisticCalculatorBase() {
  const inputId = useId();

  // 输入状态
  const [rawInput, setRawInput] = useState<string>("4 7 2 9 5 8 3 6");
  const [inputError, setInputError] = useState<string>("");
  const [distribution, setDistribution] = useState<"normal" | "uniform">("normal");
  const [sampleSize, setSampleSize] = useState<number>(8);

  // 数据与计算结果
  const [data, setData] = useState<number[]>([4, 7, 2, 9, 5, 8, 3, 6]);

  // 分母选择：false = n-1（无偏），true = n（有偏）
  const [useBiased, setUseBiased] = useState<boolean>(false);

  // 展开顺序统计量
  const [showOrder, setShowOrder] = useState<boolean>(false);

  const stats: Stats | null = data.length >= 2 ? calcStats(data) : null;

  // ─── 解析输入 ──────────────────────────────────────────────
  const parseInput = useCallback((raw: string): number[] | null => {
    const parts = raw.trim().split(/[\s,，]+/).filter(Boolean);
    if (parts.length < 2) return null;
    const nums = parts.map(Number);
    if (nums.some(isNaN)) return null;
    return nums;
  }, []);

  function handleInputChange(val: string) {
    setRawInput(val);
    const parsed = parseInput(val);
    if (parsed) {
      setData(parsed);
      setInputError("");
    } else {
      setInputError("请输入至少 2 个数字，用空格或逗号分隔");
    }
  }

  // ─── 随机生成 ──────────────────────────────────────────────
  function generateRandom() {
    const n = sampleSize;
    let arr: number[];
    if (distribution === "normal") {
      arr = Array.from({ length: n }, () => randNormal(5, 2));
    } else {
      arr = Array.from({ length: n }, () => Math.random() * 10);
    }
    arr = arr.map((v) => Math.round(v * 100) / 100);
    setData(arr);
    setRawInput(arr.join(" "));
    setInputError("");
  }

  const varUsed = stats ? (useBiased ? stats.varN : stats.varN1) : 0;
  const stdUsed = Math.sqrt(varUsed);
  const denomLabel = useBiased ? "n" : "n−1";
  const denomVal = stats ? (useBiased ? stats.n : stats.n - 1) : 1;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">统计量计算器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          输入样本数据，逐步展示 X̄、S²、S 的计算过程，并直观比较有偏 vs 无偏估计。
        </p>
      </div>

      {/* 输入区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-[13px] font-semibold text-[var(--ink)]">
            样本数据（空格或逗号分隔）
          </label>
          <input
            id={inputId}
            type="text"
            value={rawInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="例：4 7 2 9 5 8 3 6"
            className="w-full rounded-lg border px-3 py-1.5 font-mono text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            style={{ borderColor: inputError ? "var(--md-sys-color-error)" : GRAY_LINE }}
          />
          {inputError && (
            <p className="text-[11px] text-[var(--md-sys-color-error)]">{inputError}</p>
          )}
        </div>

        {/* 随机生成控制 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)]">
            <span className="font-medium text-[var(--ink)]">分布：</span>
            {(["normal", "uniform"] as const).map((d) => (
              <label key={d} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="distribution"
                  value={d}
                  checked={distribution === d}
                  onChange={() => setDistribution(d)}
                  className="accent-[var(--accent)]"
                />
                {d === "normal" ? "正态 N(5,4)" : "均匀 U[0,10]"}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)]">
            <span className="font-medium text-[var(--ink)]">样本量 n=</span>
            <input
              type="number"
              min={2}
              max={30}
              value={sampleSize}
              onChange={(e) => setSampleSize(Math.max(2, Math.min(30, Number(e.target.value))))}
              className="w-14 rounded border px-2 py-0.5 text-center font-mono text-[13px] text-[var(--ink)]"
              style={{ borderColor: GRAY_LINE }}
            />
          </div>
          <button
            onClick={generateRandom}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] transition-opacity hover:opacity-90"
            style={{ background: ACCENT }}
          >
            随机生成
          </button>
        </div>
      </div>

      {/* 分母切换 */}
      {stats && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5 bg-[var(--bg-muted)]">
          <span className="text-[13px] font-semibold text-[var(--ink)] flex-shrink-0">方差分母：</span>
          <div className="flex gap-1.5">
            {([false, true] as const).map((biased) => (
              <button
                key={String(biased)}
                onClick={() => setUseBiased(biased)}
                className={
                  "rounded-md px-3 py-1 text-[12px] font-semibold transition-colors " +
                  (useBiased === biased
                    ? "text-[var(--md-sys-color-on-primary)]"
                    : "text-[var(--ink-soft)] bg-[var(--bg-elevated)] border border-[var(--line)] hover:border-[var(--accent)]")
                }
                style={useBiased === biased ? { background: ACCENT } : {}}
              >
                {biased ? "n（有偏 / 总体方差）" : "n−1（无偏 / 样本方差 S²）"}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-[var(--ink-soft)]">
            {useBiased
              ? "以 n 为分母得有偏估计，会低估总体方差"
              : "以 n−1 为分母得无偏估计，是统计学标准 S²"}
          </span>
        </div>
      )}

      {/* 数轴可视化 */}
      {stats && (
        <div className="rounded-lg border border-[var(--line)] px-2 py-3">
          <div className="mb-1 px-2 text-[12px] font-semibold text-[var(--ink)]">
            样本数轴（X̄ 橙线 · 蓝区 = X̄ ± S）
          </div>
          <NumberLine
            data={data}
            mean={stats.mean}
            stdN1={stats.stdN1}
            useBiased={useBiased}
          />
        </div>
      )}

      {/* 计算步骤 */}
      {stats && (
        <div className="space-y-3">
          {/* Step 1: 求和与均值 */}
          <StepCard step={1} title="计算样本均值 X̄">
            <div className="font-mono">
              Σxᵢ = {data.join(" + ")} = <strong style={{ color: ACCENT }}>{fmt(stats.sum)}</strong>
            </div>
            <div className="font-mono mt-1">
              X̄ = Σxᵢ / n = {fmt(stats.sum)} / {stats.n}{" "}
              = <strong style={{ color: ORANGE }}>{fmt(stats.mean)}</strong>
            </div>
          </StepCard>

          {/* Step 2: 偏差与偏差平方 */}
          <StepCard step={2} title="计算各偏差 (xᵢ − X̄) 与平方">
            <div className="overflow-x-auto">
              <table className="min-w-full text-center text-[11px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1 font-semibold text-[var(--ink)]">i</th>
                    <th className="px-2 py-1 font-semibold text-[var(--ink)]">xᵢ</th>
                    <th className="px-2 py-1 font-semibold" style={{ color: ORANGE }}>xᵢ − X̄</th>
                    <th className="px-2 py-1 font-semibold" style={{ color: GREEN }}>(xᵢ − X̄)²</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((xi, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? "bg-[var(--bg-muted)]" : "bg-[var(--bg-elevated)]"}
                    >
                      <td className="px-2 py-0.5 font-mono">{i + 1}</td>
                      <td className="px-2 py-0.5 font-mono">{fmt(xi, 2)}</td>
                      <td className="px-2 py-0.5 font-mono" style={{ color: ORANGE }}>
                        {stats.deviations[i] >= 0 ? "+" : ""}
                        {fmt(stats.deviations[i])}
                      </td>
                      <td className="px-2 py-0.5 font-mono font-semibold" style={{ color: GREEN }}>
                        {fmt(stats.devSq[i])}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--line)]">
                    <td colSpan={2} className="px-2 py-1 text-right font-semibold text-[var(--ink)] text-[12px]">
                      Σ =
                    </td>
                    <td className="px-2 py-1 font-mono font-semibold" style={{ color: ORANGE }}>
                      {fmt(stats.deviations.reduce((a, b) => a + b, 0))}
                    </td>
                    <td className="px-2 py-1 font-mono font-bold" style={{ color: GREEN }}>
                      {fmt(stats.sumDevSq)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">
              注：偏差之和 ≈ 0（均值定义保证），偏差平方和（SS） ={" "}
              <strong style={{ color: GREEN }}>{fmt(stats.sumDevSq)}</strong>
            </p>
          </StepCard>

          {/* Step 3: 方差与标准差 */}
          <StepCard step={3} title={`计算方差 S² (分母 ${denomLabel}) 与标准差 S`}>
            <div className="font-mono">
              S² = Σ(xᵢ−X̄)² / {denomLabel} = {fmt(stats.sumDevSq)} / {denomVal}{" "}
              = <strong style={{ color: ACCENT }}>{fmt(varUsed)}</strong>
            </div>
            <div className="font-mono mt-1">
              S = √S² = √{fmt(varUsed)} ={" "}
              <strong style={{ color: ACCENT }}>{fmt(stdUsed)}</strong>
            </div>

            {/* n vs n-1 对比 */}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div
                className="rounded-md px-2.5 py-2 text-center"
                style={{
                  background: useBiased ? ACCENT_LIGHT : "var(--bg-muted)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: useBiased ? ACCENT : GRAY_LINE,
                }}
              >
                <div className="text-[10px] text-[var(--ink-soft)]">有偏 S²（÷n）</div>
                <div className="text-[14px] font-extrabold font-mono" style={{ color: useBiased ? ACCENT : "var(--ink-faint)" }}>
                  {fmt(stats.varN)}
                </div>
                <div className="text-[9px] text-[var(--ink-soft)]">S = {fmt(stats.stdN)}</div>
              </div>
              <div
                className="rounded-md px-2.5 py-2 text-center"
                style={{
                  background: !useBiased ? GREEN_LIGHT : "var(--bg-muted)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: !useBiased ? GREEN : GRAY_LINE,
                }}
              >
                <div className="text-[10px] text-[var(--ink-soft)]">无偏 S²（÷n−1）</div>
                <div className="text-[14px] font-extrabold font-mono" style={{ color: !useBiased ? GREEN : "var(--ink-faint)" }}>
                  {fmt(stats.varN1)}
                </div>
                <div className="text-[9px] text-[var(--ink-soft)]">S = {fmt(stats.stdN1)}</div>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">
              <strong>为什么用 n−1？</strong> 样本均值 X̄ 已消耗了 1 个自由度，
              用 n−1 作分母才能保证 E[S²] = σ²（无偏估计量）。
            </p>
          </StepCard>

          {/* Step 4: 顺序统计量 */}
          <StepCard step={4} title="顺序统计量 X(1) ≤ X(2) ≤ … ≤ X(n)">
            <div className="flex items-center gap-2 flex-wrap">
              {stats.sorted.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span
                    className="rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold text-[var(--md-sys-color-on-primary)]"
                    style={{ background: ACCENT, opacity: 0.75 + (i / (stats.n - 1 || 1)) * 0.25 }}
                  >
                    {fmt(v, 2)}
                  </span>
                  <span className="text-[9px] text-[var(--ink-soft)]">X({i + 1})</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowOrder(!showOrder)}
              className="mt-2 text-[11px] text-[var(--accent)] underline"
            >
              {showOrder ? "收起" : "展开"} Min / Median / Max 解读
            </button>
            {showOrder && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "最小值 X(1)", val: stats.sorted[0], sub: "第1顺序统计量" },
                  {
                    label: "中位数",
                    val:
                      stats.n % 2 === 1
                        ? stats.sorted[Math.floor(stats.n / 2)]
                        : (stats.sorted[stats.n / 2 - 1] + stats.sorted[stats.n / 2]) / 2,
                    sub: stats.n % 2 === 1 ? `X(${Math.floor(stats.n / 2) + 1})` : "两中间均值",
                  },
                  { label: "最大值 X(n)", val: stats.sorted[stats.n - 1], sub: `第${stats.n}顺序统计量` },
                ].map(({ label, val, sub }) => (
                  <div
                    key={label}
                    className="rounded-lg px-2 py-1.5"
                    style={{ background: ACCENT_LIGHT }}
                  >
                    <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
                    <div className="font-mono text-[14px] font-bold" style={{ color: ACCENT }}>
                      {fmt(val, 2)}
                    </div>
                    <div className="text-[9px] text-[var(--ink-soft)]">{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </StepCard>
        </div>
      )}

      {/* 结果摘要卡 */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "样本均值 X̄", val: fmt(stats.mean), color: ORANGE },
            { label: `样本方差 S² (÷${denomLabel})`, val: fmt(varUsed), color: ACCENT },
            { label: `样本标准差 S`, val: fmt(stdUsed), color: ACCENT },
            { label: "样本量 n", val: String(stats.n), color: GREEN },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-2.5 text-center"
            >
              <div className="text-[10px] text-[var(--ink-soft)] leading-snug">{label}</div>
              <div className="mt-1 font-mono text-[16px] font-extrabold" style={{ color }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 知识洞察 */}
      {stats && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">核心概念：</span>
          X̄、S² 等统计量是总体参数 μ、σ² 的估计量——它们本身是随机变量（不同样本得出不同值）。
          <span className="font-semibold text-[var(--ink)]"> S²（除以 n−1）是 σ² 的无偏估计</span>，
          意味着无数次抽样取平均后等于真实方差。
          切换「分母」对比，感受差异在小样本时更明显。
        </div>
      )}

      {/* 数据不足提示 */}
      {data.length < 2 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-[var(--color-warning)]">
          请输入至少 2 个数字以开始计算。
        </div>
      )}
    </div>
  );
}

export default memo(StatisticCalculatorBase);