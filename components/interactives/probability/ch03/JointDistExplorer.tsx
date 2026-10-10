"use client";

import { rowMarginals as marginalX } from '@/lib/learning/probability/math/marginals';
import { columnMarginals as marginalY } from '@/lib/learning/probability/math/marginals';

import { memo, useState } from "react";

// ─── 设计常量 ────────────────────────────────────────────────────────────────
const ACCENT = "#5b46e5";
const ACCENT_LIGHT = "var(--accent-weak)";
const ACCENT_MID = "#7c6af0";

// 热力图色阶：白→浅紫→中紫→深紫
function heatColor(ratio: number): string {
  // ratio in [0, 1]
  const stops = [
    [240, 238, 255], // #f0eeff - 几乎白
    [189, 176, 255], // #bdb0ff - 浅紫
    [124, 106, 240], // #7c6af0 - 中紫
    [63,  39, 186],  // #3f27ba - 深紫
  ];
  const t = Math.max(0, Math.min(1, ratio));
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round(a[0] + f * (b[0] - a[0]));
  const g = Math.round(a[1] + f * (b[1] - a[1]));
  const bl = Math.round(a[2] + f * (b[2] - a[2]));
  return `rgb(${r},${g},${bl})`;
}

// ─── 初始分布（3×3，行=X 取值，列=Y 取值）────────────────────────────────────
const INITIAL_RAW: number[][] = [
  [0.10, 0.08, 0.06],
  [0.12, 0.18, 0.10],
  [0.08, 0.14, 0.14],
];

// 行列标签
const X_LABELS = ["x₁", "x₂", "x₃"];
const Y_LABELS = ["y₁", "y₂", "y₃"];

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function normalize(raw: number[][]): number[][] {
  let sum = 0;
  for (const row of raw) for (const v of row) sum += Math.max(0, v);
  if (sum === 0) {
    return raw.map((row) => row.map(() => 1 / 9));
  }
  return raw.map((row) => row.map((v) => Math.max(0, v) / sum));
}

function fmt(v: number): string {
  return v.toFixed(4);
}

// ─── 随机生成一组分布 ────────────────────────────────────────────────────────
function randomRaw(): number[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => Math.random())
  );
}

// ─── 预设场景 ────────────────────────────────────────────────────────────────
type PresetKey = "custom" | "uniform" | "diag" | "corner";

const PRESETS: Record<PresetKey, { label: string; raw: number[][] | null }> = {
  uniform: {
    label: "均匀分布",
    raw: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  },
  diag: {
    label: "对角线（X=Y 相关）",
    raw: [[9, 1, 0], [1, 9, 1], [0, 1, 9]],
  },
  corner: {
    label: "角落集中",
    raw: [[8, 1, 1], [1, 1, 1], [1, 1, 6]],
  },
  custom: { label: "自定义", raw: null },
};

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

// ─── 热力图子组件 ────────────────────────────────────────────────────────────
interface HeatmapGridProps {
  p: number[][];
  pX: number[];
  pY: number[];
  maxP: number;
  hoveredCell: [number, number] | null;
  setHoveredCell: (cell: [number, number] | null) => void;
  hovered: { i: number; j: number; val: number } | null;
}

const CELL = 56;       // 主格子大小
const MARGIN_L = 28;   // 左侧 X 标签宽度
const MARGIN_T = 20;   // 顶部 Y 标签高度
const MARGIN_BAR = 10; // 主格到边缘柱之间的间距
const BAR_W = 36;      // 边缘分布柱的最大长度（px）
const BAR_CELL = 46;   // 边缘分布格子大小

const N = 3;
const SVG_W = MARGIN_L + N * CELL + MARGIN_BAR + BAR_CELL + 4;
const SVG_H = MARGIN_T + N * CELL + MARGIN_BAR + BAR_CELL + 4;

function HeatmapGrid({
  p,
  pX,
  pY,
  maxP,
  hoveredCell,
  setHoveredCell,
  hovered,
}: HeatmapGridProps) {
  const barMax = Math.max(...pX, ...pY, 0.01);

  return (
    <div>
      {/* 悬停信息提示框 */}
      <div
        className="mb-2 h-7 rounded-md px-3 flex items-center text-[12px] font-mono"
        style={{
          background: hovered ? ACCENT_LIGHT : "transparent",
          color: hovered ? ACCENT : "transparent",
          border: hovered ? `1px solid ${ACCENT}40` : "1px solid transparent",
          transition: "all 0.15s",
        }}
      >
        {hovered
          ? `P(X=${X_LABELS[hovered.i]}, Y=${Y_LABELS[hovered.j]}) = ${fmt(hovered.val)}`
          : "悬停格子查看精确概率"}
      </div>

      {/* SVG 热力图 */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full max-w-[320px]"
        style={{ userSelect: "none" }}
        onMouseLeave={() => setHoveredCell(null)}
      >
        {/* Y 轴标签（顶部）*/}
        {Y_LABELS.map((yl, j) => (
          <text
            key={j}
            x={MARGIN_L + j * CELL + CELL / 2}
            y={MARGIN_T - 5}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="var(--ink-soft)"
          >
            {yl}
          </text>
        ))}

        {/* X 轴标签（左侧） */}
        {X_LABELS.map((xl, i) => (
          <text
            key={i}
            x={MARGIN_L - 5}
            y={MARGIN_T + i * CELL + CELL / 2 + 4}
            textAnchor="end"
            fontSize="12"
            fontWeight="600"
            fill="var(--ink-soft)"
          >
            {xl}
          </text>
        ))}

        {/* 主格子（3×3 热力图） */}
        {p.map((row, i) =>
          row.map((val, j) => {
            const cx = MARGIN_L + j * CELL;
            const cy = MARGIN_T + i * CELL;
            const ratio = maxP > 0 ? val / maxP : 0;
            const isHovered =
              hoveredCell !== null && hoveredCell[0] === i && hoveredCell[1] === j;
            const bgColor = heatColor(ratio);
            const textColor = ratio > 0.55 ? "#ffffff" : ACCENT;
            return (
              <g key={`${i}-${j}`}>
                <rect
                  x={cx + 1}
                  y={cy + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  rx="6"
                  fill={bgColor}
                  stroke={isHovered ? ACCENT : "transparent"}
                  strokeWidth={isHovered ? 2 : 0}
                  style={{ cursor: "pointer", transition: "stroke 0.1s" }}
                  onMouseEnter={() => setHoveredCell([i, j])}
                />
                {/* 格子内显示概率值 */}
                <text
                  x={cx + CELL / 2}
                  y={cy + CELL / 2 - 3}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={textColor}
                  style={{ pointerEvents: "none" }}
                >
                  {fmt(val)}
                </text>
                {/* 格子内小柱状进度 */}
                <rect
                  x={cx + 6}
                  y={cy + CELL / 2 + 8}
                  width={(CELL - 12) * ratio}
                  height={4}
                  rx="2"
                  fill={ratio > 0.55 ? "rgba(255,255,255,0.6)" : `${ACCENT}50`}
                  style={{ pointerEvents: "none" }}
                />
                <rect
                  x={cx + 6}
                  y={cy + CELL / 2 + 8}
                  width={CELL - 12}
                  height={4}
                  rx="2"
                  fill="none"
                  stroke={ratio > 0.55 ? "rgba(255,255,255,0.3)" : `${ACCENT}30`}
                  strokeWidth="1"
                  style={{ pointerEvents: "none" }}
                />
              </g>
            );
          })
        )}

        {/* 右侧：X 边缘分布（柱 + 数值）*/}
        <text
          x={MARGIN_L + N * CELL + MARGIN_BAR + BAR_CELL / 2}
          y={MARGIN_T - 5}
          textAnchor="middle"
          fontSize="10"
          fill="var(--ink-faint)"
        >
          P(X)
        </text>
        {pX.map((val, i) => {
          const cy = MARGIN_T + i * CELL;
          const barLen = barMax > 0 ? (val / barMax) * BAR_W : 0;
          const cx = MARGIN_L + N * CELL + MARGIN_BAR;
          return (
            <g key={i}>
              <rect
                x={cx + 2}
                y={cy + (CELL - 20) / 2}
                width={BAR_W}
                height={20}
                rx="4"
                fill={ACCENT_LIGHT}
              />
              <rect
                x={cx + 2}
                y={cy + (CELL - 20) / 2}
                width={barLen}
                height={20}
                rx="4"
                fill={ACCENT}
                style={{ transition: "width 0.3s" }}
              />
              <text
                x={cx + BAR_W / 2 + 2}
                y={cy + CELL / 2 + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={barLen > BAR_W * 0.5 ? "#fff" : ACCENT}
                style={{ pointerEvents: "none" }}
              >
                {fmt(val)}
              </text>
            </g>
          );
        })}

        {/* 底部：Y 边缘分布（柱 + 数值）*/}
        <text
          x={MARGIN_L - 5}
          y={MARGIN_T + N * CELL + MARGIN_BAR + BAR_CELL / 2 + 4}
          textAnchor="end"
          fontSize="10"
          fill="var(--ink-faint)"
        >
          P(Y)
        </text>
        {pY.map((val, j) => {
          const cx = MARGIN_L + j * CELL;
          const barLen = barMax > 0 ? (val / barMax) * BAR_W : 0;
          const cy = MARGIN_T + N * CELL + MARGIN_BAR;
          return (
            <g key={j}>
              <rect
                x={cx + (CELL - 20) / 2}
                y={cy + 2}
                width={20}
                height={BAR_W}
                rx="4"
                fill={ACCENT_LIGHT}
              />
              <rect
                x={cx + (CELL - 20) / 2}
                y={cy + 2}
                width={20}
                height={barLen}
                rx="4"
                fill={ACCENT_MID}
                style={{ transition: "height 0.3s" }}
              />
              <text
                x={cx + CELL / 2}
                y={cy + BAR_W / 2 + 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={barLen > BAR_W * 0.5 ? "#fff" : ACCENT_MID}
                style={{ pointerEvents: "none" }}
              >
                {fmt(val)}
              </text>
            </g>
          );
        })}

        {/* 右下角：总和 = 1 */}
        <rect
          x={MARGIN_L + N * CELL + MARGIN_BAR + 2}
          y={MARGIN_T + N * CELL + MARGIN_BAR + 2}
          width={BAR_CELL - 4}
          height={BAR_CELL - 4}
          rx="6"
          fill={ACCENT}
        />
        <text
          x={MARGIN_L + N * CELL + MARGIN_BAR + BAR_CELL / 2}
          y={MARGIN_T + N * CELL + MARGIN_BAR + BAR_CELL / 2 - 2}
          textAnchor="middle"
          fontSize="9"
          fill="#fff"
        >
          ΣΣ
        </text>
        <text
          x={MARGIN_L + N * CELL + MARGIN_BAR + BAR_CELL / 2}
          y={MARGIN_T + N * CELL + MARGIN_BAR + BAR_CELL / 2 + 10}
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#fff"
        >
          1.00
        </text>
      </svg>

      {/* 色阶图例 */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-[var(--ink-soft)]">低</span>
        <div
          className="flex-1 h-2.5 rounded-full"
          style={{
            background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(0.33)}, ${heatColor(0.66)}, ${heatColor(1)})`,
          }}
        />
        <span className="text-[10px] text-[var(--ink-soft)]">高</span>
        <span className="text-[10px] text-[var(--ink-soft)] ml-1">概率密度</span>
      </div>
    </div>
  );
}

export default memo(JointDistExplorerBase);
