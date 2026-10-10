import { makeHistogram } from "@/lib/learning/probability/sampling/normalSampling";
import { GREEN, ROSE, GRAY_LINE, GREEN_LIGHT, ROSE_LIGHT } from "./appearance";
// ─── SVG 直方图子组件 ──────────────────────────────────────────

interface HistChartProps {
  title: string;
  subtitle: string;
  data: number[];
  nBins: number;
  xMin: number;
  xMax: number;
  color: string;
  colorLight: string;
  pdfFn: (x: number) => number;
  ksPValue: number;
  nSamples: number;
  xLabel?: string;
}

export function HistChart({
  title,
  subtitle,
  data,
  nBins,
  xMin,
  xMax,
  color,
  colorLight,
  pdfFn,
  ksPValue: ksP,
  nSamples,
  xLabel,
}: HistChartProps) {
  const W = 280;
  const H = 140;
  const PAD = { top: 8, right: 8, bottom: 28, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const bins = makeHistogram(data, nBins, xMin, xMax);
  const step = (xMax - xMin) / nBins;

  // 直方图高度（密度 = count / (n * step)）
  const densities = bins.map((b) => (nSamples > 0 ? b.count / (nSamples * step) : 0));

  // 理论 PDF 点
  const pdfPoints = 80;
  const pdfCurve: Array<[number, number]> = [];
  for (let i = 0; i <= pdfPoints; i++) {
    const x = xMin + (i / pdfPoints) * (xMax - xMin);
    pdfCurve.push([x, pdfFn(x)]);
  }

  // y 轴最大值（取直方图与PDF的较大者）
  const maxDensity = Math.max(
    ...densities,
    ...pdfCurve.map(([, y]) => y),
    0.01
  );

  const scaleX = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const scaleY = (y: number) => PAD.top + (1 - y / maxDensity) * innerH;

  // X 轴刻度（最多 5 个）
  const xTicks: number[] = [];
  const xStep = (xMax - xMin) / 4;
  for (let i = 0; i <= 4; i++) {
    xTicks.push(xMin + i * xStep);
  }

  // PDF 路径
  const pdfPath = pdfCurve
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${scaleX(x).toFixed(1)},${scaleY(y).toFixed(1)}`)
    .join(" ");

  // K-S 颜色
  const ksColor = ksP >= 0.05 ? GREEN : ROSE;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-2">
      <div className="mb-1 px-1">
        <div className="text-[12px] font-bold" style={{ color }}>{title}</div>
        <div className="text-[10px] text-[var(--ink-soft)]">{subtitle}</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 150 }}>
        {/* 背景 */}
        <rect
          x={PAD.left} y={PAD.top}
          width={innerW} height={innerH}
          fill="var(--bg-muted)" stroke={GRAY_LINE}
        />

        {/* 直方图柱 */}
        {bins.map((bin, i) => {
          const bx = scaleX(bin.lo);
          const bw = Math.max(1, scaleX(bin.hi) - scaleX(bin.lo) - 1);
          const by = scaleY(densities[i]);
          const bh = scaleY(0) - by;
          return (
            <rect
              key={i}
              x={bx}
              y={by}
              width={bw}
              height={Math.max(0, bh)}
              fill={colorLight}
              stroke={color}
              strokeWidth="0.5"
              opacity="0.8"
            />
          );
        })}

        {/* 理论 PDF 曲线 */}
        {nSamples > 0 && (
          <path
            d={pdfPath}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        )}

        {/* X 轴 */}
        <line
          x1={PAD.left} y1={PAD.top + innerH}
          x2={PAD.left + innerW} y2={PAD.top + innerH}
          stroke="var(--line)" strokeWidth="1"
        />

        {/* X 轴刻度 */}
        {xTicks.map((v) => (
          <g key={v}>
            <line
              x1={scaleX(v)} y1={PAD.top + innerH}
              x2={scaleX(v)} y2={PAD.top + innerH + 3}
              stroke="var(--line)"
            />
            <text
              x={scaleX(v)} y={PAD.top + innerH + 10}
              textAnchor="middle" fontSize="8" fill="var(--ink-faint)"
            >
              {Math.abs(v) < 0.01 ? "0" : v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* X 轴标签 */}
        {xLabel && (
          <text
            x={PAD.left + innerW / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize="8"
            fill="var(--ink-faint)"
            fontStyle="italic"
          >
            {xLabel}
          </text>
        )}
      </svg>

      {/* K-S 检验结果 */}
      <div
        className="mt-1 rounded px-2 py-0.5 text-[10px] font-mono text-center"
        style={{
          background: ksP >= 0.05 ? GREEN_LIGHT : ROSE_LIGHT,
          color: ksColor,
        }}
      >
        K-S p值 = {nSamples > 0 ? ksP.toFixed(4) : "—"}
        {nSamples > 0 && (
          <span className="ml-1">
            {ksP >= 0.05 ? "[OK] 符合理论" : "[X] 偏离理论"}
          </span>
        )}
      </div>
    </div>
  );
}