"use client";

import { memo, useState, useCallback } from "react";
import { getInitialOutcomes, PRESETS, computeDistribution } from "@/lib/learning/probability/distributions/discreteMapping";
import type { PresetKey, DieOutcome, Preset } from "@/lib/learning/probability/distributions/discreteMapping";
import { INK, INK_SOFT, ACCENT, BG_MUTED, LINE, ACCENT_LIGHT } from "./RVMapper/appearance";
import { DieFace, DistChart } from "./RVMapper/plot";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function RVMapperBase() {
  const [activePreset, setActivePreset] = useState<PresetKey>("identity");
  const [outcomes, setOutcomes] = useState<DieOutcome[]>(() =>
    getInitialOutcomes(PRESETS.find((p) => p.key === "identity")!.fn)
  );
  const [selectedFace, setSelectedFace] = useState<number | null>(null);
  const [hoveredX, setHoveredX] = useState<number | null>(null);

  // 切换预设
  const applyPreset = useCallback((preset: Preset) => {
    setActivePreset(preset.key);
    if (preset.key !== "custom") {
      setOutcomes(getInitialOutcomes(preset.fn));
    }
    setSelectedFace(null);
  }, []);

  // 更新某个样本点的 X 值
  const updateXValue = useCallback((face: number, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    setOutcomes((prev) =>
      prev.map((o) => (o.face === face ? { ...o, xValue: num } : o))
    );
    // 一旦手动编辑，切换到 custom 模式
    setActivePreset("custom");
  }, []);

  const dist = computeDistribution(outcomes);
  const currentPreset = PRESETS.find((p) => p.key === activePreset)!;

  // 当前悬停 X 值对应的样本点
  const hoveredFaces = hoveredX !== null
    ? dist.find((d) => d.xVal === hoveredX)?.faces ?? []
    : [];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题区 */}
      <div>
        <h3 className="text-[15px] font-bold" style={{ color: INK }}>
          随机变量映射器
        </h3>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
          掷一颗骰子，样本空间 Ω = &#123;1, 2, 3, 4, 5, 6&#125;。为每个样本点 ω 指定实数值 X(ω)，
          即定义了一个<b style={{ color: INK }}>随机变量</b>。底部实时展示 X 的分布律 P(X=x)。
        </p>
      </div>

      {/* 预设变换按钮 */}
      <div>
        <div className="mb-2 text-[12px] font-semibold" style={{ color: INK }}>
          选择变换预设
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset)}
              className="rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all duration-150"
              style={{
                background: activePreset === preset.key ? ACCENT : BG_MUTED,
                color: activePreset === preset.key ? "white" : INK_SOFT,
                border: `1px solid ${activePreset === preset.key ? ACCENT : LINE}`,
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {/* 预设说明 */}
        <p
          className="mt-2 text-[11px] leading-relaxed rounded-lg px-3 py-2"
          style={{ background: ACCENT_LIGHT, color: ACCENT }}
        >
          {currentPreset.description}
        </p>
      </div>

      {/* 映射区：样本点 → X 值 */}
      <div
        className="rounded-xl p-4"
        style={{ background: BG_MUTED, border: `1px solid ${LINE}` }}
      >
        <div className="mb-3 text-[12px] font-semibold" style={{ color: INK }}>
          定义映射 X : Ω → ℝ
        </div>
        <div className="flex flex-col gap-2.5">
          {outcomes.map(({ face, xValue }) => {
            const isHighlighted = hoveredFaces.includes(face);
            const isSelected = selectedFace === face;
            return (
              <div
                key={face}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150"
                style={{
                  background: isHighlighted
                    ? ACCENT_LIGHT
                    : isSelected
                    ? "var(--accent-weak)"
                    : "var(--bg-elevated)",
                  border: `1px solid ${isHighlighted ? ACCENT : isSelected ? "#c4b5fd" : LINE}`,
                }}
              >
                {/* 骰子图标 */}
                <DieFace
                  face={face}
                  selected={isHighlighted || isSelected}
                  onClick={() =>
                    setSelectedFace(selectedFace === face ? null : face)
                  }
                />

                {/* 映射箭头 */}
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-[13px]" style={{ color: INK_SOFT }}>
                    ω = {face}
                  </span>
                  <svg width={28} height={14} className="flex-shrink-0">
                    <defs>
                      <marker
                        id={`arrow-${face}`}
                        markerWidth={6}
                        markerHeight={6}
                        refX={3}
                        refY={3}
                        orient="auto"
                      >
                        <path
                          d="M0,0 L0,6 L6,3 z"
                          fill={isHighlighted ? ACCENT : "var(--ink-faint)"}
                        />
                      </marker>
                    </defs>
                    <line
                      x1={2}
                      y1={7}
                      x2={20}
                      y2={7}
                      stroke={isHighlighted ? ACCENT : "var(--ink-faint)"}
                      strokeWidth={1.5}
                      markerEnd={`url(#arrow-${face})`}
                    />
                  </svg>
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: isHighlighted ? ACCENT : INK }}
                  >
                    X =
                  </span>
                </div>

                {/* X 值输入框 */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={xValue}
                    onChange={(e) => updateXValue(face, e.target.value)}
                    onFocus={() => setSelectedFace(face)}
                    onBlur={() => setSelectedFace(null)}
                    className="w-[70px] rounded-lg border px-2 py-1 text-[13px] font-mono font-bold text-center transition-all focus:outline-none focus:ring-2"
                    style={{
                      borderColor: isHighlighted ? ACCENT : LINE,
                      background: isHighlighted ? "var(--bg-elevated)" : BG_MUTED,
                      color: isHighlighted ? ACCENT : INK,
                      boxShadow: isHighlighted ? `0 0 0 2px ${ACCENT}33` : "none",
                    }}
                    step="1"
                  />
                  <span className="text-[11px]" style={{ color: INK_SOFT }}>
                    P = 1/6
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 分布律图表 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-semibold" style={{ color: INK }}>
            分布律 P(X = x)
          </div>
          <div className="text-[11px]" style={{ color: INK_SOFT }}>
            共 <b style={{ color: INK }}>{dist.length}</b> 个不同取值，
            概率之和 ={" "}
            <b style={{ color: ACCENT }}>
              {dist.reduce((s, d) => s + d.prob, 0).toFixed(4)}
            </b>
          </div>
        </div>
        <DistChart dist={dist} hoveredX={hoveredX} onHover={setHoveredX} />
      </div>

      {/* 分布律表格 */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${LINE}` }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: BG_MUTED }}>
              <th
                className="px-3 py-2 text-left font-semibold"
                style={{ color: INK, borderBottom: `1px solid ${LINE}` }}
              >
                x（取值）
              </th>
              {dist.map((d) => (
                <th
                  key={d.xVal}
                  className="px-3 py-2 text-center font-mono font-bold transition-colors"
                  style={{
                    color: hoveredX === d.xVal ? ACCENT : INK,
                    background:
                      hoveredX === d.xVal ? ACCENT_LIGHT : "transparent",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                  onMouseEnter={() => setHoveredX(d.xVal)}
                  onMouseLeave={() => setHoveredX(null)}
                >
                  {d.xVal}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                className="px-3 py-2 font-semibold"
                style={{ color: INK_SOFT, borderBottom: `1px solid ${LINE}` }}
              >
                P(X = x)
              </td>
              {dist.map((d) => (
                <td
                  key={d.xVal}
                  className="px-3 py-2 text-center font-mono transition-colors"
                  style={{
                    color: hoveredX === d.xVal ? ACCENT : INK,
                    fontWeight: hoveredX === d.xVal ? 700 : 400,
                    background:
                      hoveredX === d.xVal ? ACCENT_LIGHT : "transparent",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                  onMouseEnter={() => setHoveredX(d.xVal)}
                  onMouseLeave={() => setHoveredX(null)}
                >
                  {d.faces.length}/6
                </td>
              ))}
            </tr>
            <tr style={{ background: BG_MUTED }}>
              <td
                className="px-3 py-2 text-[11px]"
                style={{ color: INK_SOFT }}
              >
                对应样本点
              </td>
              {dist.map((d) => (
                <td
                  key={d.xVal}
                  className="px-3 py-2 text-center text-[11px] transition-colors"
                  style={{
                    color: hoveredX === d.xVal ? ACCENT : INK_SOFT,
                    background:
                      hoveredX === d.xVal ? ACCENT_LIGHT : "transparent",
                  }}
                  onMouseEnter={() => setHoveredX(d.xVal)}
                  onMouseLeave={() => setHoveredX(null)}
                >
                  &#123;{d.faces.join(", ")}&#125;
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 洞察区 */}
      <div
        className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed space-y-2"
        style={{
          background: BG_MUTED,
          border: `1px solid ${LINE}`,
          color: INK_SOFT,
        }}
      >
        <div>
          <span className="font-semibold" style={{ color: INK }}>
            核心概念：
          </span>
          随机变量 X 是从样本空间 Ω 到实数 ℝ 的<b style={{ color: INK }}>函数</b>。
          它把随机试验的结果{'"数值化"'}，使我们能用数学工具分析概率。
        </div>
        <div>
          <span className="font-semibold" style={{ color: INK }}>
            分布律归一：
          </span>
          不论如何设置 X 值，所有概率之和始终等于 1。
          这是因为骰子 6 个等可能结果的概率之和 = 6 × (1/6) = 1。
        </div>
        {dist.length < 6 && (
          <div>
            <span className="font-semibold" style={{ color: ACCENT }}>
              多对一映射：
            </span>
            当前有多个样本点映射到相同 X 值，形成{'"合并"'}效果，该取值的概率变大——
            这正是随机变量强大之处：通过变换揭示概率的结构。
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RVMapperBase);