import { hasAnalyticConvPDF, analyticConvPDF } from "@/lib/learning/probability/joint/convolution";
import type { DistParams } from "@/lib/learning/probability/joint/convolution";
import { PAD, CHART_W, CHART_H, W, H, GRAY_BG, GRAY_LINE, ACCENT, ORANGE } from "./appearance";
// ─── 直方图 SVG ────────────────────────────────────────────────
interface HistogramSVGProps {
  bins: number[];
  sampleCount: number;
  binMin: number;
  binMax: number;
  xDist: DistParams;
  yDist: DistParams;
  showPdf: boolean;
}

export function HistogramSVG({
  bins,
  sampleCount,
  binMin,
  binMax,
  xDist,
  yDist,
  showPdf,
}: HistogramSVGProps) {
  const numBins = bins.length;
  const span = binMax - binMin;
  const binWidth = span / numBins;

  // 密度值 = count / (n * binWidth)
  const densities = bins.map((c) => c / (sampleCount * binWidth));
  const maxDens = Math.max(...densities, 0.001);

  // 计算 PDF 曲线点
  const pdfPoints: [number, number][] = [];
  const hasPdf =
    showPdf && hasAnalyticConvPDF(xDist.type, yDist.type);

  if (hasPdf) {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const z = binMin + (i / steps) * span;
      const density = analyticConvPDF(z, xDist, yDist);
      pdfPoints.push([z, density]);
    }
  }

  const maxDensAll = hasPdf
    ? Math.max(maxDens, ...pdfPoints.map((p) => p[1]), 0.001)
    : maxDens;

  // 坐标映射
  function xScale(v: number) {
    return PAD.left + ((v - binMin) / span) * CHART_W;
  }
  function yScale(d: number) {
    return PAD.top + CHART_H - (d / maxDensAll) * CHART_H;
  }

  // X 轴刻度（最多 6 个）
  const tickCount = 5;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(binMin + (i / tickCount) * span);
  }

  const pdfPath =
    hasPdf && pdfPoints.length > 1
      ? pdfPoints
          .map(([z, d], i) => `${i === 0 ? "M" : "L"}${xScale(z).toFixed(2)},${yScale(d).toFixed(2)}`)
          .join(" ")
      : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* 背景 */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={CHART_W}
        height={CHART_H}
        fill={GRAY_BG}
        stroke={GRAY_LINE}
      />

      {/* Y 轴网格线 */}
      {[0.25, 0.5, 0.75, 1.0].map((f) => {
        const d = f * maxDensAll;
        const yy = yScale(d);
        return (
          <g key={f}>
            <line
              x1={PAD.left}
              y1={yy}
              x2={PAD.left + CHART_W}
              y2={yy}
              stroke={GRAY_LINE}
              strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 4}
              y={yy + 3}
              fontSize={9}
              textAnchor="end"
              fill="var(--ink-faint)"
            >
              {d.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* 直方图条 */}
      {densities.map((d, i) => {
        const bx = xScale(binMin + i * binWidth);
        const bw = (CHART_W / numBins) - 0.5;
        const bh = (d / maxDensAll) * CHART_H;
        const by = PAD.top + CHART_H - bh;
        return (
          <rect
            key={i}
            x={bx + 0.25}
            y={by}
            width={Math.max(bw, 0.5)}
            height={Math.max(bh, 0)}
            fill={ACCENT}
            opacity={0.55}
            rx={0.5}
          />
        );
      })}

      {/* 理论 PDF 曲线 */}
      {hasPdf && pdfPath && (
        <path
          d={pdfPath}
          fill="none"
          stroke={ORANGE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}

      {/* X 轴刻度 */}
      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={xScale(v)}
            y1={PAD.top + CHART_H}
            x2={xScale(v)}
            y2={PAD.top + CHART_H + 3}
            stroke="var(--ink-faint)"
          />
          <text
            x={xScale(v)}
            y={PAD.top + CHART_H + 13}
            fontSize={9}
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* 轴标签 */}
      <text
        x={PAD.left + CHART_W / 2}
        y={H - 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-faint)"
      >
        Z = X + Y
      </text>
      <text
        x={9}
        y={PAD.top + CHART_H / 2}
        fontSize={9}
        textAnchor="middle"
        fill="var(--ink-faint)"
        transform={`rotate(-90, 9, ${PAD.top + CHART_H / 2})`}
      >
        密度
      </text>
    </svg>
  );
}