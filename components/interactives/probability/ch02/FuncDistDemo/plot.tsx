import { PAD_L, PLOT_W, PAD_T, PLOT_H, W, H, GRAY_BG, GRAY_LINE } from "./appearance";
import type { HistBin } from "@/lib/learning/probability/distributions/transformations";
// ─── 坐标映射 ─────────────────────────────────────────────────
function mapX(val: number, min: number, max: number): number {
  return PAD_L + ((val - min) / (max - min)) * PLOT_W;
}
function mapY(val: number, maxVal: number): number {
  return PAD_T + PLOT_H - (val / maxVal) * PLOT_H;
}

// ─── 刻度生成 ─────────────────────────────────────────────────
function niceTicks(min: number, max: number, count: number = 5): number[] {
  const range = max - min;
  const step = range / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(parseFloat((min + step * i).toFixed(2)));
  }
  return ticks;
}

// ─── PDF 折线路径生成 ────────────────────────────────────────
function buildPdfPath(
  pdfFn: (v: number) => number,
  xMin: number,
  xMax: number,
  yMax: number,
  steps: number = 200
): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const xVal = xMin + t * (xMax - xMin);
    const yVal = pdfFn(xVal);
    if (!isFinite(yVal) || isNaN(yVal)) continue;
    const sx = mapX(xVal, xMin, xMax);
    const sy = mapY(Math.min(yVal, yMax * 1.05), yMax);
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
  }
  return pts.join(" ");
}

// ─── 单个 SVG 图表组件 ────────────────────────────────────────
interface PdfChartProps {
  title: string;
  xLabel: string;
  pdfFn: (v: number) => number;
  xMin: number;
  xMax: number;
  color: string;
  histBins?: HistBin[];
  histColor?: string;
  pdfMaxY?: number;
}

export function PdfChart({
  title,
  xLabel,
  pdfFn,
  xMin,
  xMax,
  color,
  histBins,
  histColor = "#94a3b8",
  pdfMaxY,
}: PdfChartProps) {
  // 计算 y 轴最大值
  let computedMax = 0;
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    const y = pdfFn(x);
    if (isFinite(y) && !isNaN(y)) computedMax = Math.max(computedMax, y);
  }
  if (histBins) {
    for (const b of histBins) computedMax = Math.max(computedMax, b.density);
  }
  const yMax = (pdfMaxY ?? computedMax * 1.15) || 1;

  const pdfPath = buildPdfPath(pdfFn, xMin, xMax, yMax);
  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = niceTicks(0, yMax, 4);

  return (
    <div>
      <div className="mb-1 text-center text-[11px] font-semibold text-[var(--ink-soft)]">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 背景 */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={PLOT_W}
          height={PLOT_H}
          fill={GRAY_BG}
          stroke={GRAY_LINE}
        />

        {/* y 轴网格线 */}
        {yTicks.map((v) => {
          const sy = mapY(v, yMax);
          return (
            <g key={v}>
              <line
                x1={PAD_L}
                y1={sy}
                x2={PAD_L + PLOT_W}
                y2={sy}
                stroke={GRAY_LINE}
                strokeDasharray="3 2"
              />
              <text
                x={PAD_L - 4}
                y={sy + 3}
                fontSize="9"
                textAnchor="end"
                fill="var(--ink-faint)"
              >
                {v.toFixed(v < 1 ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {/* x 轴刻度 */}
        {xTicks.map((v) => {
          const sx = mapX(v, xMin, xMax);
          return (
            <g key={v}>
              <line
                x1={sx}
                y1={PAD_T + PLOT_H}
                x2={sx}
                y2={PAD_T + PLOT_H + 4}
                stroke="var(--ink-faint)"
              />
              <text
                x={sx}
                y={PAD_T + PLOT_H + 13}
                fontSize="9"
                textAnchor="middle"
                fill="var(--ink-faint)"
              >
                {Math.abs(v) < 0.001 ? "0" : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* 轴标签 */}
        <text
          x={PAD_L + PLOT_W / 2}
          y={H - 2}
          fontSize="10"
          textAnchor="middle"
          fill="var(--ink-faint)"
        >
          {xLabel}
        </text>
        <text
          x={9}
          y={PAD_T + PLOT_H / 2}
          fontSize="9"
          textAnchor="middle"
          fill="var(--ink-faint)"
          transform={`rotate(-90,9,${PAD_T + PLOT_H / 2})`}
        >
          密度
        </text>

        {/* 直方图 */}
        {histBins &&
          histBins.map((bin, i) => {
            const bx0 = mapX(bin.x0, xMin, xMax);
            const bx1 = mapX(bin.x1, xMin, xMax);
            const by = mapY(Math.min(bin.density, yMax * 1.05), yMax);
            const bh = PAD_T + PLOT_H - by;
            if (bh <= 0) return null;
            return (
              <rect
                key={i}
                x={bx0 + 0.5}
                y={by}
                width={Math.max(bx1 - bx0 - 1, 0)}
                height={bh}
                fill={histColor}
                opacity={0.45}
              />
            );
          })}

        {/* 理论/实际 PDF 曲线 */}
        {pdfPath && (
          <path d={pdfPath} fill="none" stroke={color} strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}