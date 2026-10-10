import { ACCENT_LIGHT, ACCENT, SVG_W, SVG_H, MARGIN_L, CELL, MARGIN_T, heatColor, N, MARGIN_BAR, BAR_CELL, BAR_W, ACCENT_MID } from "./appearance";
import { X_LABELS, Y_LABELS } from "@/lib/learning/probability/joint/jointDistribution";
import { fmt } from "./formatters";
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

export function HeatmapGrid({
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