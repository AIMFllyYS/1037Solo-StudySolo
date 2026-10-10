import { ACCENT, LINE, ACCENT_LIGHT, INK, CHART_W, CHART_PL, CHART_PR, CHART_H, CHART_PT, CHART_PB, BG_MUTED, INK_SOFT, BAR_COLORS } from "./appearance";
import type { DistEntry } from "@/lib/learning/probability/distributions/discreteMapping";
// ─── 骰子面 SVG ───────────────────────────────────────────────────────────────
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

interface DieFaceProps {
  face: number;
  selected: boolean;
  onClick: () => void;
}

export function DieFace({ face, selected, onClick }: DieFaceProps) {
  const dots = DOT_POSITIONS[face] ?? [];
  return (
    <button
      onClick={onClick}
      className="rounded-xl border-2 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{
        borderColor: selected ? ACCENT : LINE,
        background: selected ? ACCENT_LIGHT : "var(--bg-elevated)",
        boxShadow: selected ? `0 0 0 2px ${ACCENT}44` : "0 1px 3px rgba(0,0,0,0.08)",
        padding: 0,
        width: 52,
        height: 52,
        flexShrink: 0,
      }}
      aria-label={`骰子点数 ${face}`}
    >
      <svg viewBox="0 0 100 100" width={44} height={44} style={{ display: "block", margin: "auto" }}>
        {dots.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={9}
            fill={selected ? ACCENT : INK}
          />
        ))}
      </svg>
    </button>
  );
}

interface DistChartProps {
  dist: DistEntry[];
  hoveredX: number | null;
  onHover: (x: number | null) => void;
}

export function DistChart({ dist, hoveredX, onHover }: DistChartProps) {
  const innerW = CHART_W - CHART_PL - CHART_PR;
  const innerH = CHART_H - CHART_PT - CHART_PB;

  const maxProb = Math.max(...dist.map((d) => d.prob), 1 / 6);
  const yScale = (p: number) => innerH - (p / maxProb) * innerH;
  const yPx = (p: number) => CHART_PT + yScale(p);

  // y 轴刻度
  const yTicks: number[] = [];
  const step = maxProb <= 1 / 6 ? 1 / 6 : maxProb <= 3 / 6 ? 1 / 6 : 2 / 6;
  for (let v = 0; v <= maxProb + 0.001; v += step) {
    yTicks.push(Math.round(v * 6) / 6);
  }

  const barCount = dist.length;
  const totalBarWidth = innerW;
  const barW = Math.min(48, (totalBarWidth / Math.max(barCount, 1)) * 0.6);
  const spacing = barCount > 1 ? totalBarWidth / (barCount - 1) : 0;
  const barX = (i: number) =>
    barCount === 1
      ? CHART_PL + innerW / 2
      : CHART_PL + i * spacing;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full rounded-lg border"
      style={{ borderColor: LINE, background: BG_MUTED, maxHeight: 180 }}
      onMouseLeave={() => onHover(null)}
    >
      {/* 网格线 */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={CHART_PL}
            y1={yPx(v)}
            x2={CHART_W - CHART_PR}
            y2={yPx(v)}
            stroke={v === 0 ? "var(--line)" : "var(--line)"}
            strokeWidth={v === 0 ? 1.5 : 1}
          />
          <text
            x={CHART_PL - 6}
            y={yPx(v) + 4}
            fontSize={9}
            textAnchor="end"
            fill={INK_SOFT}
          >
            {v === 0 ? "0" : `${Math.round(v * 6)}/6`}
          </text>
        </g>
      ))}

      {/* y 轴标签 */}
      <text
        x={8}
        y={CHART_PT + innerH / 2}
        fontSize={9}
        fill={INK_SOFT}
        textAnchor="middle"
        transform={`rotate(-90, 8, ${CHART_PT + innerH / 2})`}
      >
        P(X=x)
      </text>

      {/* 柱子 */}
      {dist.map((d, i) => {
        const cx = barX(i);
        const topY = yPx(d.prob);
        const bottomY = yPx(0);
        const barH = bottomY - topY;
        const isHovered = hoveredX === d.xVal;
        const color = BAR_COLORS[i % BAR_COLORS.length];

        return (
          <g
            key={d.xVal}
            onMouseEnter={() => onHover(d.xVal)}
            style={{ cursor: "pointer" }}
          >
            {/* 柱子 */}
            <rect
              x={cx - barW / 2}
              y={topY}
              width={barW}
              height={Math.max(barH, 0)}
              fill={color}
              opacity={isHovered ? 1 : 0.78}
              rx={3}
            />
            {/* hover 时高亮背景 */}
            {isHovered && (
              <rect
                x={cx - barW / 2 - 4}
                y={CHART_PT}
                width={barW + 8}
                height={innerH}
                fill={color}
                opacity={0.08}
                rx={4}
              />
            )}
            {/* 概率标签（柱顶） */}
            <text
              x={cx}
              y={topY - 4}
              fontSize={9}
              textAnchor="middle"
              fill={color}
              fontWeight={700}
            >
              {d.faces.length}/6
            </text>
            {/* x 轴标签 */}
            <text
              x={cx}
              y={CHART_H - CHART_PB + 14}
              fontSize={10}
              textAnchor="middle"
              fill={isHovered ? ACCENT : INK_SOFT}
              fontWeight={isHovered ? 700 : 400}
            >
              {d.xVal}
            </text>
          </g>
        );
      })}

      {/* x 轴标签 "x" */}
      <text
        x={CHART_W - CHART_PR}
        y={CHART_H - CHART_PB + 14}
        fontSize={10}
        textAnchor="end"
        fill={INK_SOFT}
        fontStyle="italic"
      >
        x
      </text>
    </svg>
  );
}