"use client";

import { memo, useState, useMemo } from "react";
import { computeCurve } from "@/lib/learning/probability/samplingDistributions";
import type { TabId } from "@/lib/learning/probability/samplingDistributions";
import { TABS } from "./SamplingDistExplorer/metadata";
import { GRAY_LINE } from "./SamplingDistExplorer/appearance";
import { SliderRow } from "./SamplingDistExplorer/controls";
import { DistPlot } from "./SamplingDistExplorer/plot";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function SamplingDistExplorerBase() {
  const [activeTab, setActiveTab] = useState<TabId>("chi2");

  // χ² 参数
  const [chi2N, setChi2N] = useState(5);

  // t 参数
  const [tN, setTN] = useState(5);

  // F 参数
  const [fM, setFM] = useState(5);
  const [fN, setFN] = useState(10);

  // 显著性水平 α
  const [alpha, setAlpha] = useState(0.05);

  // 是否显示正态对照
  const [showNormal, setShowNormal] = useState(true);

  const tab = TABS.find((t) => t.id === activeTab)!;

  // 计算曲线（useMemo 避免重复计算）
  const curveResult = useMemo(
    () =>
      computeCurve({
        tabId: activeTab,
        chi2N,
        tN,
        fM,
        fN,
        alpha,
        showNormal,
      }),
    [activeTab, chi2N, tN, fM, fN, alpha, showNormal]
  );

  // 当前自由度描述
  function dfDesc(): string {
    if (activeTab === "chi2") return `自由度 n = ${chi2N}`;
    if (activeTab === "t") return `自由度 n = ${tN}`;
    return `自由度 m = ${fM}, n = ${fN}`;
  }

  // 分布均值/方差理论值
  function theoreticalStats(): { mean: string; variance: string; convergence: string } {
    if (activeTab === "chi2") {
      return {
        mean: `E(X) = n = ${chi2N}`,
        variance: `Var(X) = 2n = ${2 * chi2N}`,
        convergence: `n→∞ 时，(χ²-n)/√(2n) → N(0,1)`,
      };
    }
    if (activeTab === "t") {
      const v = tN > 2 ? `n/(n-2) = ${(tN / (tN - 2)).toFixed(3)}` : "∞（n≤2时无定义）";
      return {
        mean: "E(X) = 0（n>1）",
        variance: `Var(X) = ${v}`,
        convergence: `n→∞ 时，t(n) → N(0,1)（图中虚线）`,
      };
    }
    const vMean = fN > 2 ? `n/(n-2) = ${(fN / (fN - 2)).toFixed(3)}` : "∞（n≤2）";
    return {
      mean: `E(X) = ${vMean}`,
      variance: fN > 4 ? `Var(X) = 2n²(m+n-2)/[m(n-2)²(n-4)]` : "∞（n≤4）",
      convergence: `m,n→∞ 时，F(m,n) 的标准化形式趋近 N(0,1)`,
    };
  }

  const stats = theoreticalStats();

  // 关联说明
  function relationNote(): string {
    if (activeTab === "chi2") {
      return `若 X₁,…,Xₙ ~ N(0,1) 独立，则 X₁²+…+Xₙ² ~ χ²(n)。样本方差 S² 的抽样分布正是 χ²。`;
    }
    if (activeTab === "t") {
      return `若 X~N(0,1) 与 Y~χ²(n) 独立，则 X/√(Y/n) ~ t(n)。样本均值标准化后服从 t 分布。`;
    }
    return `若 X~χ²(m)，Y~χ²(n) 独立，则 (X/m)/(Y/n) ~ F(m,n)。方差比检验的基础分布。`;
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">三大抽样分布探索器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          切换 χ²、t、F 分布，调整自由度与显著性水平，实时观察 PDF 曲线与右尾临界值。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="rounded-lg px-4 py-1.5 text-[13px] font-bold transition-all"
            style={{
              background: activeTab === t.id ? t.color : "transparent",
              color: activeTab === t.id ? "white" : t.color,
              border: `2px solid ${t.color}`,
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setShowNormal((v) => !v)}
          className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border"
          style={{
            borderColor: GRAY_LINE,
            background: showNormal ? "var(--bg-muted)" : "var(--bg-elevated)",
            color: showNormal ? "var(--ink-soft)" : "var(--ink-faint)",
          }}
        >
          {showNormal ? "▣" : "□"} 正态对照
        </button>
      </div>

      {/* 控制面板 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
        {/* χ² 参数 */}
        {activeTab === "chi2" && (
          <SliderRow
            label="自由度 n"
            value={chi2N}
            min={1}
            max={30}
            step={1}
            color={tab.color}
            bg={tab.bg}
            onChange={setChi2N}
          />
        )}
        {/* t 参数 */}
        {activeTab === "t" && (
          <SliderRow
            label="自由度 n"
            value={tN}
            min={1}
            max={30}
            step={1}
            color={tab.color}
            bg={tab.bg}
            onChange={setTN}
          />
        )}
        {/* F 参数 */}
        {activeTab === "F" && (
          <div className="space-y-3">
            <SliderRow
              label="分子自由度 m"
              value={fM}
              min={1}
              max={20}
              step={1}
              color={tab.color}
              bg={tab.bg}
              onChange={setFM}
            />
            <SliderRow
              label="分母自由度 n"
              value={fN}
              min={2}
              max={30}
              step={1}
              color={tab.color}
              bg={tab.bg}
              onChange={setFN}
            />
          </div>
        )}

        {/* 显著性水平 */}
        <SliderRow
          label="显著性水平 α（右尾概率）"
          value={alpha}
          min={0.01}
          max={0.1}
          step={0.01}
          color="var(--md-sys-color-error)"
          bg="#dc26261f"
          onChange={setAlpha}
          format={(v) => v.toFixed(2)}
        />
      </div>

      {/* PDF 曲线图 */}
      <div>
        <div className="mb-2 flex items-center justify-between flex-wrap gap-1">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            概率密度曲线 — {dfDesc()}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-mono font-bold"
            style={{ background: "#dc26261f", color: "var(--md-sys-color-error)" }}
          >
            {curveResult.criticalLabel}
          </span>
        </div>
        <DistPlot
          result={curveResult}
          tabId={activeTab}
          color={tab.color}
          showNormal={showNormal}
          alpha={alpha}
        />
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-6 rounded-sm"
              style={{ background: tab.color, opacity: 0.3 }}
            />
            <span className="text-[var(--ink-soft)]">
              右尾面积 ≈ {curveResult.tailArea.toFixed(4)}（理论 = {alpha.toFixed(2)}）
            </span>
          </div>
          {showNormal && (
            <div className="flex items-center gap-1.5">
              <svg width="18" height="6">
                <line
                  x1="0"
                  y1="3"
                  x2="18"
                  y2="3"
                  stroke="var(--ink-faint)"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
              </svg>
              <span className="text-[var(--ink-soft)]">标准正态 N(0,1)</span>
            </div>
          )}
        </div>
      </div>

      {/* 临界值与理论结果 */}
      <div
        className="rounded-lg border-2 p-4 space-y-3"
        style={{ borderColor: tab.color, background: tab.bg }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[14px] font-bold text-[var(--ink)]">临界值</span>
          <span
            className="text-[20px] font-extrabold font-mono"
            style={{ color: tab.color }}
          >
            {curveResult.criticalLabel}
          </span>
        </div>
        <p className="text-[12px] text-[var(--ink-soft)] leading-relaxed">
          {activeTab === "chi2" &&
            `右尾面积 P(χ²(${chi2N}) > ${curveResult.critical.toFixed(3)}) = α = ${alpha.toFixed(2)}。
            当检验统计量超过此临界值，拒绝 H₀。`}
          {activeTab === "t" &&
            `双侧临界值：P(|t(${tN})| > ${curveResult.critical.toFixed(3)}) = α = ${alpha.toFixed(2)}。
            左右两侧各占 α/2 = ${(alpha / 2).toFixed(3)}。`}
          {activeTab === "F" &&
            `右尾面积 P(F(${fM},${fN}) > ${curveResult.critical.toFixed(3)}) = α = ${alpha.toFixed(2)}。
            F 分布仅在右尾做单侧检验（方差比总为正）。`}
        </p>
      </div>

      {/* 理论参数 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "均值", val: stats.mean, color: tab.color, bg: tab.bg },
          { label: "方差", val: stats.variance, color: "var(--ink-soft)", bg: "var(--bg-muted)" },
          { label: "极限行为", val: stats.convergence, color: "var(--ink-soft)", bg: "var(--bg-muted)" },
        ].map(({ label, val, color, bg }) => (
          <div key={label} className="rounded-lg p-2.5" style={{ background: bg }}>
            <div className="text-[10px] font-semibold text-[var(--ink-soft)] mb-0.5">{label}</div>
            <div className="text-[11px] font-mono font-bold leading-snug" style={{ color }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* n→∞ 渐近正态对比说明 */}
      {showNormal && (
        <div
          className="rounded-lg border p-3 space-y-1"
          style={{ borderColor: GRAY_LINE, background: "var(--bg-muted)" }}
        >
          <div className="text-[12px] font-bold text-[var(--ink)]">
            n → ∞ 收敛到正态（图中灰虚线）
          </div>
          <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">
            {activeTab === "chi2" &&
              `自由度 n 增大时，χ²(n) 的 PDF 越来越接近正态形状：均值 n、标准差 √(2n)。
              当前 n=${chi2N}，${chi2N >= 20 ? "曲线已相当接近正态。" : "增大 n 可明显看到收敛效果。"}`}
            {activeTab === "t" &&
              `自由度 n 增大时，t(n) 的尾部越来越细，趋近 N(0,1)。
              当前 n=${tN}，${tN >= 30 ? "与正态已十分接近（工程上常用 n≥30 直接用正态）。" : "可看到 t 分布比正态有更厚的尾部（重尾特性）。"}`}
            {activeTab === "F" &&
              `m,n 均增大时，F(m,n) 的形状越来越对称，趋向正态。
              当前 F(${fM},${fN})，${Math.min(fM, fN) >= 15 ? "对称性已较好，中心近似正态。" : "可以看到明显的右偏形状。"}`}
          </p>
        </div>
      )}

      {/* 分布来源与检验联系 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1.5">
        <div className="font-semibold text-[13px] text-[var(--ink)]">
          {activeTab === "chi2" && "χ² 分布的来源"}
          {activeTab === "t" && "t 分布的来源"}
          {activeTab === "F" && "F 分布的来源"}
        </div>
        <p>{relationNote()}</p>
        <p>
          <span className="font-semibold text-[var(--ink)]">检验用途：</span>
          {activeTab === "chi2" && "样本方差检验、拟合优度检验、独立性检验。"}
          {activeTab === "t" && "单样本均值 t 检验、两样本均值 t 检验、回归系数显著性检验。"}
          {activeTab === "F" && "方差齐性检验（F 检验）、方差分析（ANOVA）、回归方程整体显著性检验。"}
        </p>
        <p className="text-[11px]">
          <span className="font-semibold text-[var(--ink)]">使用提示：</span>
          拖动自由度滑块观察曲线形状变化；调整 α 看临界值如何移动；开启「正态对照」直观感受收敛速度。
        </p>
      </div>
    </div>
  );
}

export default memo(SamplingDistExplorerBase);