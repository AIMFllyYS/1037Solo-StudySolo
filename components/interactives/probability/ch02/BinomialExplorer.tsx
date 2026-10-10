"use client";

import { memo, useState, useMemo } from "react";
import { binomPMF, poissonPMF } from "@/lib/learning/probability/distributions/binomial";
import type { TabType } from "@/lib/learning/probability/distributions/binomial";
import { ACCENT, TEAL, ACCENT_LIGHT, TEAL_LIGHT } from "./BinomialExplorer/appearance";
import { SliderRow, StatCard } from "./BinomialExplorer/controls";
import { BarChart } from "./BinomialExplorer/plot";
import { BinomInsight, PoissonInsight, BinomPoissonBridge } from "./BinomialExplorer/insights";
function BinomialExplorerBase() {
  const [tab, setTab] = useState<TabType>("binomial");

  // 二项分布参数
  const [n, setN] = useState(10);
  const [p, setP] = useState(0.5);

  // 泊松分布参数
  const [lambda, setLambda] = useState(3.0);

  // ─── 二项分布数据 ───────────────────────────────────────────
  const binomData = useMemo(() => {
    return Array.from({ length: n + 1 }, (_, k) => ({
      k,
      p: binomPMF(n, p, k),
    }));
  }, [n, p]);

  const binomMean = n * p;
  const binomVar = n * p * (1 - p);
  const binomStd = Math.sqrt(binomVar);

  // ─── 泊松分布数据 ───────────────────────────────────────────
  // 显示到均值 + 4σ（≈均值+4√λ），至少到 k=20
  const poissonKMax = Math.max(20, Math.ceil(lambda + 4 * Math.sqrt(lambda) + 2));

  const poissonData = useMemo(() => {
    return Array.from({ length: poissonKMax + 1 }, (_, k) => ({
      k,
      p: poissonPMF(lambda, k),
    }));
  }, [lambda, poissonKMax]);

  const poissonMean = lambda;
  const poissonVar = lambda;
  const poissonStd = Math.sqrt(lambda);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">
          二项 / 泊松分布探索器
        </h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          拖动滑块实时调参，直观感受参数如何改变分布的形状、中心与离散程度。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--line)] w-fit">
        {(
          [
            { key: "binomial", label: "二项分布 B(n, p)" },
            { key: "poisson", label: "泊松分布 P(λ)" },
          ] as { key: TabType; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "px-4 py-2 text-[13px] font-semibold transition-colors " +
              (tab === key
                ? "text-white"
                : "text-[var(--ink-soft)] bg-[var(--bg-muted)] hover:bg-[var(--line)]")
            }
            style={tab === key ? { background: key === "binomial" ? ACCENT : TEAL } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ 二项分布面板 ═══ */}
      {tab === "binomial" && (
        <>
          {/* 滑块区 */}
          <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
            <SliderRow
              label="试验次数 n"
              value={n}
              min={1}
              max={30}
              step={1}
              displayValue={String(n)}
              color={ACCENT}
              bgColor={ACCENT_LIGHT}
              onChange={(v) => setN(v)}
            />
            <SliderRow
              label="成功概率 p"
              value={p}
              min={0}
              max={1}
              step={0.01}
              displayValue={p.toFixed(2)}
              color={ACCENT}
              bgColor={ACCENT_LIGHT}
              onChange={(v) => setP(v)}
            />
          </div>

          {/* 分布律说明 */}
          <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-2.5 text-[12px] text-[var(--ink-soft)] leading-loose font-mono">
            P(X=k) = C(n,k)·p^k·(1−p)^(n−k)
            <span className="ml-2 text-[var(--ink-soft)]">k = 0,1,…,n</span>
          </div>

          {/* 柱状图 */}
          <BarChart
            data={binomData}
            mean={binomMean}
            color={ACCENT}
            label={`二项分布 B(${n},${p.toFixed(2)}) 分布律柱状图`}
          />

          {/* 统计量 */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="均值 E(X) = np"
              value={binomMean.toFixed(3)}
              color={ACCENT}
              bg={ACCENT_LIGHT}
            />
            <StatCard
              label="方差 D(X) = np(1−p)"
              value={binomVar.toFixed(3)}
              color={ACCENT}
              bg={ACCENT_LIGHT}
            />
            <StatCard
              label="标准差 σ = √(np(1−p))"
              value={binomStd.toFixed(3)}
              color={ACCENT}
              bg={ACCENT_LIGHT}
            />
          </div>

          {/* 洞察说明 */}
          <BinomInsight n={n} p={p} mean={binomMean} />
        </>
      )}

      {/* ═══ 泊松分布面板 ═══ */}
      {tab === "poisson" && (
        <>
          {/* 滑块区 */}
          <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
            <SliderRow
              label="平均发生次数 λ"
              value={lambda}
              min={0.1}
              max={15}
              step={0.1}
              displayValue={lambda.toFixed(1)}
              color={TEAL}
              bgColor={TEAL_LIGHT}
              onChange={(v) => setLambda(v)}
            />
          </div>

          {/* 分布律说明 */}
          <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-2.5 text-[12px] text-[var(--ink-soft)] leading-loose font-mono">
            P(X=k) = e^(−λ) · λ^k / k!
            <span className="ml-2 text-[var(--ink-soft)]">k = 0,1,2,…</span>
          </div>

          {/* 柱状图 */}
          <BarChart
            data={poissonData}
            mean={poissonMean}
            color={TEAL}
            label={`泊松分布 P(λ=${lambda.toFixed(1)}) 分布律柱状图`}
          />

          {/* 统计量 */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="均值 E(X) = λ"
              value={poissonMean.toFixed(3)}
              color={TEAL}
              bg={TEAL_LIGHT}
            />
            <StatCard
              label="方差 D(X) = λ"
              value={poissonVar.toFixed(3)}
              color={TEAL}
              bg={TEAL_LIGHT}
            />
            <StatCard
              label="标准差 σ = √λ"
              value={poissonStd.toFixed(3)}
              color={TEAL}
              bg={TEAL_LIGHT}
            />
          </div>

          {/* 洞察说明 */}
          <PoissonInsight lambda={lambda} />
        </>
      )}

      {/* 底部：二项 → 泊松 极限定理提示 */}
      <BinomPoissonBridge tab={tab} n={n} p={p} lambda={lambda} />
    </div>
  );
}

export default memo(BinomialExplorerBase);