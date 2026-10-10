import { fmt4 } from "./formatters";
import { Y_LABELS, X_LABELS } from "@/lib/learning/probability/marginalDistributions";
import type { Mode } from "@/lib/learning/probability/marginalDistributions";
import { MARGIN_L, CELL, MARGIN_T, ACCENT_LIGHT, ACCENT, TEAL } from "./appearance";
// ─── 热力图色阶 ───────────────────────────────────────────────────────────────
export function heatColor(ratio: number): string {
  const stops: [number, number, number][] = [
    [240, 238, 255],
    [189, 176, 255],
    [124, 106, 240],
    [63, 39, 186],
  ];
  const t = Math.max(0, Math.min(1, ratio));
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  return `rgb(${Math.round(a[0] + f * (b[0] - a[0]))},${Math.round(a[1] + f * (b[1] - a[1]))},${Math.round(a[2] + f * (b[2] - a[2]))})`;
}

// ─── 子组件：单个条形图（边缘分布可视化）────────────────────────────────────────
export interface MarginalBarProps {
  values: number[];
  labels: string[];
  color: string;
  lightColor: string;
  highlightIdx: number | null;
  direction: "horizontal" | "vertical";
}

export function MarginalBar({ values, labels, color, lightColor, highlightIdx, direction }: MarginalBarProps) {
  const maxVal = Math.max(...values, 0.001);

  if (direction === "horizontal") {
    // 横排，每个条形从左到右
    return (
      <div className="flex flex-col gap-1.5">
        {values.map((v, i) => {
          const pct = v / maxVal;
          const isHL = highlightIdx === i;
          return (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ opacity: highlightIdx === null || isHL ? 1 : 0.3, transition: "opacity 0.25s" }}
            >
              <span
                className="text-[12px] font-semibold w-6 text-right flex-shrink-0"
                style={{ color: isHL ? color : "var(--ink-faint)" }}
              >
                {labels[i]}
              </span>
              <div
                className="relative h-7 rounded-md overflow-hidden flex-1"
                style={{ background: lightColor, minWidth: 60 }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    width: `${pct * 100}%`,
                    background: isHL ? color : `${color}80`,
                    transition: "width 0.35s cubic-bezier(0.4,0,0.2,1)",
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-mono font-bold"
                  style={{ color: pct > 0.5 ? "#fff" : color }}
                >
                  {fmt4(v)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 竖排，每个条形从底到顶
  const BAR_H = 80;
  return (
    <div className="flex gap-3 items-end justify-center" style={{ height: BAR_H + 36 }}>
      {values.map((v, j) => {
        const pct = v / maxVal;
        const isHL = highlightIdx === j;
        const barH = Math.round(pct * BAR_H);
        return (
          <div
            key={j}
            className="flex flex-col items-center gap-1"
            style={{ opacity: highlightIdx === null || isHL ? 1 : 0.3, transition: "opacity 0.25s" }}
          >
            <span
              className="text-[10px] font-mono font-bold"
              style={{ color: isHL ? color : "var(--ink-faint)" }}
            >
              {fmt4(v)}
            </span>
            <div
              className="w-8 rounded-t-md"
              style={{
                height: barH,
                background: isHL ? color : `${color}80`,
                minHeight: 2,
                transition: "height 0.35s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
            <span
              className="text-[12px] font-semibold"
              style={{ color: isHL ? color : "var(--ink-faint)" }}
            >
              {labels[j]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 热力图主体 ───────────────────────────────────────────────────────────────
export interface HeatmapProps {
  p: number[][];
  selectedRow: number | null;
  selectedCol: number | null;
  mode: Mode;
  onRowClick: (i: number) => void;
  onColClick: (j: number) => void;
}

export function Heatmap({ p, selectedRow, selectedCol, mode, onRowClick, onColClick }: HeatmapProps) {
  const maxP = Math.max(...p.flatMap((r) => r), 0.001);
  const N = p.length;
  const W = MARGIN_L + N * CELL + 4;
  const H = MARGIN_T + N * CELL + 4;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 240, userSelect: "none" }}
    >
      {/* Y 标签（顶部）+ 可点击 */}
      {Y_LABELS.map((yl, j) => {
        const isHL = mode === "colSelect" && selectedCol === j;
        return (
          <g key={j} style={{ cursor: "pointer" }} onClick={() => onColClick(j)}>
            <rect
              x={MARGIN_L + j * CELL}
              y={0}
              width={CELL}
              height={MARGIN_T}
              fill={isHL ? ACCENT_LIGHT : "transparent"}
              rx={4}
            />
            <text
              x={MARGIN_L + j * CELL + CELL / 2}
              y={MARGIN_T - 6}
              textAnchor="middle"
              fontSize="12"
              fontWeight={isHL ? "800" : "600"}
              fill={isHL ? ACCENT : "var(--ink-soft)"}
            >
              {yl}
            </text>
          </g>
        );
      })}

      {/* X 标签（左侧）+ 可点击 */}
      {X_LABELS.map((xl, i) => {
        const isHL = mode === "rowSelect" && selectedRow === i;
        return (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => onRowClick(i)}>
            <rect
              x={0}
              y={MARGIN_T + i * CELL}
              width={MARGIN_L}
              height={CELL}
              fill={isHL ? ACCENT_LIGHT : "transparent"}
              rx={4}
            />
            <text
              x={MARGIN_L - 5}
              y={MARGIN_T + i * CELL + CELL / 2 + 4}
              textAnchor="end"
              fontSize="12"
              fontWeight={isHL ? "800" : "600"}
              fill={isHL ? ACCENT : "var(--ink-soft)"}
            >
              {xl}
            </text>
          </g>
        );
      })}

      {/* 主格子 */}
      {p.map((row, i) =>
        row.map((val, j) => {
          const cx = MARGIN_L + j * CELL;
          const cy = MARGIN_T + i * CELL;
          const ratio = val / maxP;

          // 判断高亮
          const rowHL = mode === "rowSelect" && selectedRow === i;
          const colHL = mode === "colSelect" && selectedCol === j;
          const dimmed =
            (mode === "rowSelect" && selectedRow !== null && selectedRow !== i) ||
            (mode === "colSelect" && selectedCol !== null && selectedCol !== j);

          const bgColor = heatColor(ratio);
          const textColor = ratio > 0.55 ? "#ffffff" : ACCENT;

          return (
            <g key={`${i}-${j}`}>
              <rect
                x={cx + 1}
                y={cy + 1}
                width={CELL - 2}
                height={CELL - 2}
                rx={6}
                fill={bgColor}
                opacity={dimmed ? 0.2 : 1}
                stroke={rowHL || colHL ? ACCENT : "transparent"}
                strokeWidth={rowHL || colHL ? 2.5 : 0}
                style={{ transition: "opacity 0.25s" }}
              />
              <text
                x={cx + CELL / 2}
                y={cy + CELL / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={textColor}
                opacity={dimmed ? 0.3 : 1}
                style={{ pointerEvents: "none", transition: "opacity 0.25s" }}
              >
                {fmt4(val)}
              </text>
            </g>
          );
        })
      )}

      {/* 行高亮覆盖框 */}
      {mode === "rowSelect" && selectedRow !== null && (
        <rect
          x={MARGIN_L + 1}
          y={MARGIN_T + selectedRow * CELL + 1}
          width={N * CELL - 2}
          height={CELL - 2}
          rx={6}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.5}
          strokeDasharray="5 3"
          opacity={0.6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* 列高亮覆盖框 */}
      {mode === "colSelect" && selectedCol !== null && (
        <rect
          x={MARGIN_L + selectedCol * CELL + 1}
          y={MARGIN_T + 1}
          width={CELL - 2}
          height={N * CELL - 2}
          rx={6}
          fill="none"
          stroke={TEAL}
          strokeWidth={2.5}
          strokeDasharray="5 3"
          opacity={0.6}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}

// ─── 反例热力图（仅展示，不交互）────────────────────────────────────────────────
export interface MiniHeatProps {
  p: number[][];
  label: string;
}

export function MiniHeat({ p, label }: MiniHeatProps) {
  const maxP = Math.max(...p.flatMap((r) => r), 0.001);
  const N = p.length;
  const C = 44;
  const ML = 24;
  const MT = 18;
  const W = ML + N * C + 4;
  const H = MT + N * C + 4;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[12px] font-semibold text-[var(--ink)]">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, userSelect: "none" }}>
        {Y_LABELS.map((yl, j) => (
          <text key={j} x={ML + j * C + C / 2} y={MT - 4} textAnchor="middle" fontSize="10" fill="var(--ink-faint)">{yl}</text>
        ))}
        {X_LABELS.map((xl, i) => (
          <text key={i} x={ML - 4} y={MT + i * C + C / 2 + 4} textAnchor="end" fontSize="10" fill="var(--ink-faint)">{xl}</text>
        ))}
        {p.map((row, i) =>
          row.map((val, j) => {
            const ratio = val / maxP;
            const textColor = ratio > 0.55 ? "#ffffff" : ACCENT;
            return (
              <g key={`${i}-${j}`}>
                <rect x={ML + j * C + 1} y={MT + i * C + 1} width={C - 2} height={C - 2} rx={5} fill={heatColor(ratio)} />
                <text x={ML + j * C + C / 2} y={MT + i * C + C / 2 + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={textColor} style={{ pointerEvents: "none" }}>
                  {val.toFixed(2)}
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}