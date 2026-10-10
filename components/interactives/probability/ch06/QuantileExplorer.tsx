"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { generateSample, computeQQ, computeStats, qqCorrelation } from "@/lib/learning/probability/sampling/quantiles";
import type { Distribution } from "@/lib/learning/probability/sampling/quantiles";
import { DIST_META, ACCENT_LIGHT, ORANGE_LIGHT, ACCENT, ORANGE, GREEN, GREEN_LIGHT } from "./QuantileExplorer/appearance";
import { SortedBar, QQPlot } from "./QuantileExplorer/plot";
// ─── 主组件 ───────────────────────────────────────────────────────────────────

function QuantileExplorerBase() {
  const [dist, setDist] = useState<Distribution>("normal");
  const [n, setN] = useState(30);
  const [sorted, setSorted] = useState<number[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState(0);

  const handleSample = useCallback(() => {
    setSorted(generateSample(dist, n));
    setSampleCount((c) => c + 1);
    setHoveredIdx(null);
  }, [dist, n]);

  const qqPoints = useMemo(() => computeQQ(sorted), [sorted]);
  const stats = useMemo(() => computeStats(sorted), [sorted]);
  const corr = useMemo(() => qqCorrelation(qqPoints), [qqPoints]);

  const meta = DIST_META[dist];
  const isNormalLike = corr > 0.97;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">样本分位数与 Q-Q 图</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          从不同分布抽样，观察 Q-Q 图点是否沿对角线排列——这正是正态性检验的直觉。
        </p>
      </div>

      {/* 控制面板 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
        {/* 分布选择 */}
        <div>
          <div className="mb-2 text-[13px] font-semibold text-[var(--ink)]">总体分布</div>
          <div className="flex flex-wrap gap-2">
            {(["normal", "uniform", "exponential"] as Distribution[]).map((d) => {
              const m = DIST_META[d];
              const active = dist === d;
              return (
                <button
                  key={d}
                  onClick={() => { setDist(d); setSorted([]); setSampleCount(0); setHoveredIdx(null); }}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all"
                  style={{
                    background: active ? m.color : "transparent",
                    color: active ? m.on : m.color,
                    border: `1.5px solid ${m.color}`,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 样本量滑块 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">样本量 n</span>
            <span
              className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
              style={{ background: meta.bg, color: meta.color }}
            >
              {n}
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={n}
            onChange={(e) => { setN(Number(e.target.value)); setSorted([]); setSampleCount(0); setHoveredIdx(null); }}
            className="w-full h-1.5 cursor-pointer"
            style={{ accentColor: meta.color }}
          />
          <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
            <span>10</span><span>100</span>
          </div>
        </div>

        {/* 抽样按钮 */}
        <button
          onClick={handleSample}
          className="w-full rounded-lg py-2 text-[14px] font-bold transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: meta.color, color: meta.on }}
        >
          {sorted.length === 0 ? "▶ 开始抽样" : "↻ 重新抽样"}
          {sampleCount > 0 && (
            <span className="ml-2 text-[11px] opacity-80 font-normal">（第 {sampleCount} 次）</span>
          )}
        </button>
      </div>

      {/* 顺序统计量条形图 */}
      {sorted.length > 0 && (
        <div>
          <div className="mb-3 text-[12px] font-semibold text-[var(--ink)]">
            排序后样本（顺序统计量 x₍₁₎ ≤ x₍₂₎ ≤ … ≤ x₍ₙ₎）
          </div>
          <SortedBar sorted={sorted} dist={dist} hoveredIdx={hoveredIdx} onHover={setHoveredIdx} />
          <div className="mt-7" />
        </div>
      )}

      {/* Q-Q 图 */}
      {sorted.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-[var(--ink)]">Q-Q 图（悬停查看分位数详情）</div>
            {qqPoints.length > 0 && (
              <div
                className="rounded-md px-2 py-0.5 text-[11px] font-mono font-bold"
                style={{
                  background: isNormalLike ? ACCENT_LIGHT : ORANGE_LIGHT,
                  color: isNormalLike ? ACCENT : ORANGE,
                }}
              >
                相关系数 r = {corr.toFixed(4)}
              </div>
            )}
          </div>
          <QQPlot
            points={qqPoints}
            dist={dist}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
          />
        </div>
      )}

      {/* 正态性判断 */}
      {sorted.length > 0 && (
        <div
          className="rounded-lg border-2 p-3 text-[12px] leading-relaxed"
          style={{
            borderColor: isNormalLike ? ACCENT : ORANGE,
            background: isNormalLike ? ACCENT_LIGHT : ORANGE_LIGHT,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[15px]">{isNormalLike ? "[OK]" : "[X]"}</span>
            <span
              className="font-bold text-[13px]"
              style={{ color: isNormalLike ? ACCENT : ORANGE }}
            >
              {isNormalLike ? "点接近对角线 → 可能来自正态总体" : "点偏离对角线 → 不服从正态分布"}
            </span>
          </div>
          <p style={{ color: isNormalLike ? "var(--accent)" : ORANGE }}>
            {meta.desc}。
            {dist === "uniform" && " 均匀分布尾部「截断」，没有极端值，所以 Q-Q 图两端向内弯曲。"}
            {dist === "exponential" && " 指数分布右偏，有长右尾，样本最大值比正态分位数大很多，图形右端上翘。"}
            {dist === "normal" && " 多次抽样重试，n 越大点越贴近 y=x 对角线。"}
          </p>
        </div>
      )}

      {/* 统计摘要 */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { label: "均值 x̄", val: stats.mean.toFixed(3), color: meta.color, bg: meta.bg },
            { label: "标准差 s", val: stats.std.toFixed(3), color: "var(--ink-soft)", bg: "var(--bg-muted)" },
            { label: "中位数", val: stats.median.toFixed(3), color: "var(--ink-soft)", bg: "var(--bg-muted)" },
            { label: "Q₁", val: stats.q1.toFixed(3), color: "var(--ink-soft)", bg: "var(--bg-muted)" },
            { label: "Q₃", val: stats.q3.toFixed(3), color: "var(--ink-soft)", bg: "var(--bg-muted)" },
            {
              label: "偏度",
              val: stats.skewness.toFixed(3),
              color: Math.abs(stats.skewness) > 0.5 ? ORANGE : GREEN,
              bg: Math.abs(stats.skewness) > 0.5 ? ORANGE_LIGHT : GREEN_LIGHT,
            },
          ].map(({ label, val, color, bg }) => (
            <div key={label} className="rounded-lg p-2 text-center" style={{ background: bg }}>
              <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
              <div className="text-[14px] font-bold font-mono mt-0.5" style={{ color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* 知识点洞察 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1.5">
        <p>
          <span className="font-semibold text-[var(--ink)]">Q-Q 图的本质：</span>
          将样本第 k 个顺序统计量 x₍ₖ₎ 与正态分布的第 k/(n+1) 分位数对比。若样本来自正态总体，
          散点近似落在 <span className="font-mono">y = x</span> 对角线上；若有系统偏离，说明分布形态不同。
        </p>
        <p>
          <span className="font-semibold text-[var(--ink)]">正态性检验的直觉：</span>
          Shapiro-Wilk 检验、K-S 检验等都在量化这种偏离程度。
          这里的 Q-Q 相关系数 r 越接近 1，越支持正态性。
        </p>
        <p>
          <span className="font-semibold text-[var(--ink)]">提示：</span>
          多点击「重新抽样」感受抽样随机性——n 小时点散漫，n=100 时规律清晰。
        </p>
      </div>
    </div>
  );
}

export default memo(QuantileExplorerBase);