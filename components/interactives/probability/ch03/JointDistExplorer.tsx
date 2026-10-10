"use client";

import { rowMarginals as marginalX } from '@/lib/learning/probability/math/marginals';
import { columnMarginals as marginalY } from '@/lib/learning/probability/math/marginals';
import { memo, useState } from "react";
import { INITIAL_RAW, normalize, PRESETS, randomRaw, Y_LABELS, X_LABELS } from "@/lib/learning/probability/joint/jointDistribution";
import type { PresetKey } from "@/lib/learning/probability/joint/jointDistribution";
import { HeatmapGrid } from "./JointDistExplorer/plot";
import { ACCENT_LIGHT, ACCENT, ACCENT_MID } from "./JointDistExplorer/appearance";
import { fmt } from "./JointDistExplorer/formatters";
// ─── 主组件 ──────────────────────────────────────────────────────────────────
function JointDistExplorerBase() {
  const [raw, setRaw] = useState<number[][]>(INITIAL_RAW);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [preset, setPreset] = useState<PresetKey>("custom");
  const [editInput, setEditInput] = useState<string>(""); // 当前正在编辑的输入框内容
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null);

  // 归一化联合分布
  const p = normalize(raw);
  const pX = marginalX(p);
  const pY = marginalY(p);

  // 联合分布的最大值（用于热力图色阶基准）
  const maxP = Math.max(...p.flatMap((row) => row));

  // 处理输入变化
  function handleInputChange(i: number, j: number, val: string) {
    setEditInput(val);
    setEditingCell([i, j]);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const next = raw.map((row, ri) =>
        row.map((v, ci) => (ri === i && ci === j ? num : v))
      );
      setRaw(next);
      setPreset("custom");
    }
  }

  function handleInputFocus(i: number, j: number) {
    setEditingCell([i, j]);
    setEditInput(raw[i][j].toString());
  }

  function handleInputBlur() {
    setEditingCell(null);
    setEditInput("");
  }

  // 应用预设
  function applyPreset(key: PresetKey) {
    setPreset(key);
    const pr = PRESETS[key];
    if (pr.raw) {
      setRaw(pr.raw.map((row) => [...row]));
    }
  }

  // 随机生成
  function handleRandom() {
    setRaw(randomRaw());
    setPreset("custom");
  }

  // 重置为初始
  function handleReset() {
    setRaw(INITIAL_RAW.map((row) => [...row]));
    setPreset("custom");
  }

  // 当前悬停格的信息
  const hovered =
    hoveredCell !== null
      ? { i: hoveredCell[0], j: hoveredCell[1], val: p[hoveredCell[0]][hoveredCell[1]] }
      : null;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">联合分布律探索器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          编辑 3×3 联合概率表，实时查看热力图与边缘分布。悬停格子查看精确概率值。
        </p>
      </div>

      {/* 预设按钮行 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[12px] text-[var(--ink-soft)] mr-1">预设：</span>
        {(["uniform", "diag", "corner"] as PresetKey[]).map((key) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className={
              "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors " +
              (preset === key
                ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak,#ede9fe)]")
            }
          >
            {PRESETS[key].label}
          </button>
        ))}
        <button
          onClick={handleRandom}
          className="rounded-lg px-2.5 py-1 text-[12px] font-medium bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak,#ede9fe)] transition-colors"
        >
          随机
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg px-2.5 py-1 text-[12px] font-medium bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line,#e9ebf2)] transition-colors"
        >
          重置
        </button>
      </div>

      {/* 核心布局：输入表 + 热力图 + 边缘 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        {/* ── 左侧：可编辑输入网格 ── */}
        <div className="flex-shrink-0">
          <p className="text-[11px] text-[var(--ink-soft)] mb-2">
            输入任意正数（自动归一化）
          </p>
          {/* 表头：Y 标签 */}
          <div className="grid grid-cols-4 gap-1 mb-1">
            <div className="text-[11px] text-[var(--ink-soft)] flex items-end justify-center pb-1">
              X↓ Y→
            </div>
            {Y_LABELS.map((yl) => (
              <div
                key={yl}
                className="text-center text-[12px] font-semibold text-[var(--ink)]"
              >
                {yl}
              </div>
            ))}
          </div>
          {/* 输入行 */}
          {raw.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-1 mb-1">
              <div className="flex items-center justify-center text-[12px] font-semibold text-[var(--ink)]">
                {X_LABELS[i]}
              </div>
              {row.map((v, j) => {
                const isEditing = editingCell !== null && editingCell[0] === i && editingCell[1] === j;
                return (
                  <input
                    key={j}
                    type="number"
                    min="0"
                    step="0.01"
                    value={isEditing ? editInput : v.toFixed(2)}
                    onChange={(e) => handleInputChange(i, j, e.target.value)}
                    onFocus={() => handleInputFocus(i, j)}
                    onBlur={handleInputBlur}
                    className="w-full rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-1.5 text-center text-[13px] font-mono text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                    style={{ width: "72px" }}
                  />
                );
              })}
            </div>
          ))}
          {/* 输入总和提示 */}
          <div className="mt-2 text-[11px] text-[var(--ink-soft)]">
            输入合计：
            <span className="font-mono font-semibold text-[var(--ink)]">
              {raw.flatMap((r) => r).reduce((s, v) => s + Math.max(0, v), 0).toFixed(4)}
            </span>
            （归一化后 = 1）
          </div>
        </div>

        {/* ── 右侧：热力图 + 边缘分布 ── */}
        <div className="flex-1 min-w-0">
          {/* 热力图区域（SVG） */}
          <HeatmapGrid
            p={p}
            pX={pX}
            pY={pY}
            maxP={maxP}
            hoveredCell={hoveredCell}
            setHoveredCell={setHoveredCell}
            hovered={hovered}
          />
        </div>
      </div>

      {/* 边缘分布汇总卡片 */}
      <div className="grid grid-cols-2 gap-3">
        {/* X 边缘 */}
        <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5">
          <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">
            X 的边缘分布 P(X=xᵢ)
          </div>
          <div className="flex gap-2">
            {pX.map((v, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="text-[11px] text-[var(--ink-soft)]">{X_LABELS[i]}</div>
                <div
                  className="mt-1 rounded-md py-1 text-[13px] font-mono font-bold"
                  style={{ background: ACCENT_LIGHT, color: ACCENT }}
                >
                  {fmt(v)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Y 边缘 */}
        <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5">
          <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">
            Y 的边缘分布 P(Y=yⱼ)
          </div>
          <div className="flex gap-2">
            {pY.map((v, j) => (
              <div key={j} className="flex-1 text-center">
                <div className="text-[11px] text-[var(--ink-soft)]">{Y_LABELS[j]}</div>
                <div
                  className="mt-1 rounded-md py-1 text-[13px] font-mono font-bold"
                  style={{ background: ACCENT_LIGHT, color: ACCENT_MID }}
                >
                  {fmt(v)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 公式说明 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
        <div>
          <span className="font-semibold text-[var(--ink)]">边缘分布公式：</span>
          {"  "}
          <span className="font-mono">P(X=xᵢ) = Σⱼ p(xᵢ, yⱼ)</span>
          {"，"}
          <span className="font-mono">P(Y=yⱼ) = Σᵢ p(xᵢ, yⱼ)</span>
        </div>
        <div>
          <span className="font-semibold text-[var(--ink)]">联合分布完备性：</span>
          {"  "}
          <span className="font-mono">Σᵢ Σⱼ p(xᵢ, yⱼ) = 1</span>
          {"。修改任意格子，边缘分布自动随之更新。"}
        </div>
      </div>
    </div>
  );
}

export default memo(JointDistExplorerBase);