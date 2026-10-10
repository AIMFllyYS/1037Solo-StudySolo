import { PX, PLOT_W, SVG_H, PY, PLOT_H, RED, ACCENT, SVG_W, GRAY_LINE } from "./appearance";
import { normalPDF, tPDF } from "@/lib/learning/probability/meanTest";
import type { TestResult, TailType, TestType } from "@/lib/learning/probability/meanTest";
// ─── SVG distribution curve ───────────────────────────────────────────────
export function buildCurve(
  xMin: number,
  xMax: number,
  pdfFn: (x: number) => number,
  steps = 200
): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    const y = pdfFn(x);
    const sx = PX + ((x - xMin) / (xMax - xMin)) * PLOT_W;
    const pdfMax = pdfFn(0);
    const sy = SVG_H - PY - (y / pdfMax) * PLOT_H * 0.85;
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

export function buildArea(
  xMin: number,
  xMax: number,
  areaXMin: number,
  areaXMax: number,
  pdfFn: (x: number) => number,
  steps = 200
): string {
  const clampedMin = Math.max(areaXMin, xMin);
  const clampedMax = Math.min(areaXMax, xMax);
  if (clampedMin >= clampedMax) return "";
  const pdfMax = pdfFn(0);
  const toSX = (x: number) => PX + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const toSY = (y: number) => SVG_H - PY - (y / pdfMax) * PLOT_H * 0.85;
  const baseline = SVG_H - PY;
  const pts: string[] = [`M${toSX(clampedMin).toFixed(2)},${baseline}`];
  for (let i = 0; i <= steps; i++) {
    const x = clampedMin + (i / steps) * (clampedMax - clampedMin);
    const y = pdfFn(x);
    pts.push(`L${toSX(x).toFixed(2)},${toSY(y).toFixed(2)}`);
  }
  pts.push(`L${toSX(clampedMax).toFixed(2)},${baseline}`, "Z");
  return pts.join(" ");
}

// ─── Distribution SVG ─────────────────────────────────────────────────────
export interface DistSVGProps {
  result: TestResult;
  tail: TailType;
  type: TestType;
  df: number;
}

export function DistSVG({ result, tail, type, df }: DistSVGProps) {
  const { statistic: stat, criticalLow, criticalHigh } = result;
  const xMin = -4.5;
  const xMax = 4.5;

  const pdf = type === "z" ? normalPDF : (x: number) => tPDF(x, df);

  const curvePath = buildCurve(xMin, xMax, pdf);
  const pdfMax = type === "z" ? normalPDF(0) : tPDF(0, df);
  const toSX = (x: number) => PX + ((Math.max(xMin, Math.min(xMax, x)) - xMin) / (xMax - xMin)) * PLOT_W;
  const toSY = (y: number) => SVG_H - PY - (y / pdfMax) * PLOT_H * 0.85;
  const baseline = SVG_H - PY;

  // Rejection area paths
  const rejLeftPath =
    tail === "left" || tail === "two"
      ? buildArea(xMin, xMax, xMin, Math.min(criticalHigh, xMax), pdf)
      : "";
  const rejRightPath =
    tail === "right" || tail === "two"
      ? buildArea(xMin, xMax, Math.max(criticalLow, xMin), xMax, pdf)
      : "";

  // Stat line position
  const statSX = toSX(stat);
  const statSY = toSY(pdf(Math.max(xMin, Math.min(xMax, stat))));
  const statColor = result.reject ? RED : ACCENT;

  // Critical value lines
  const critLines: { x: number; label: string }[] = [];
  if (tail === "left" || tail === "two") critLines.push({ x: criticalHigh, label: tail === "two" ? `-z/t` : `-z/t` });
  if (tail === "right" || tail === "two") critLines.push({ x: criticalLow, label: `z/t` });

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg border border-[var(--line)]">
      {/* Background */}
      <rect x={PX} y={PY} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" stroke={GRAY_LINE} />

      {/* X-axis ticks */}
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((v) => {
        const sx = toSX(v);
        return (
          <g key={v}>
            <line x1={sx} y1={baseline} x2={sx} y2={baseline + 3} stroke="var(--ink-faint)" />
            <text x={sx} y={baseline + 11} fontSize="8" textAnchor="middle" fill="var(--ink-faint)">{v}</text>
          </g>
        );
      })}

      {/* Rejection area - left */}
      {rejLeftPath && (
        <path d={rejLeftPath} fill={RED} opacity={0.18} />
      )}
      {/* Rejection area - right */}
      {rejRightPath && (
        <path d={rejRightPath} fill={RED} opacity={0.18} />
      )}

      {/* Distribution curve */}
      <path d={curvePath} fill="none" stroke={ACCENT} strokeWidth="2" />

      {/* Critical value vertical lines */}
      {critLines.map(({ x }) => {
        if (x === Infinity || x === -Infinity || isNaN(x)) return null;
        const sx = toSX(x);
        return (
          <line key={x} x1={sx} y1={PY} x2={sx} y2={baseline} stroke={RED} strokeDasharray="4 3" strokeWidth="1.2" />
        );
      })}

      {/* Test statistic vertical line */}
      {!isNaN(statSX) && isFinite(statSX) && (
        <>
          <line
            x1={statSX}
            y1={PY}
            x2={statSX}
            y2={baseline}
            stroke={statColor}
            strokeWidth="2"
          />
          {/* Dot on curve */}
          {statSX >= PX && statSX <= PX + PLOT_W && (
            <circle cx={statSX} cy={statSY} r="4" fill={statColor} />
          )}
          {/* Label */}
          <text
            x={Math.min(Math.max(statSX, PX + 16), PX + PLOT_W - 16)}
            y={PY + 12}
            fontSize="9"
            textAnchor="middle"
            fill={statColor}
            fontWeight="bold"
          >
            {type === "z" ? "Z" : "T"}={stat.toFixed(3)}
          </text>
        </>
      )}

      {/* Critical value labels */}
      {tail !== "right" && isFinite(criticalHigh) && (
        <text
          x={toSX(criticalHigh) - 4}
          y={PY + 22}
          fontSize="8"
          textAnchor="end"
          fill={RED}
        >
          {criticalHigh.toFixed(3)}
        </text>
      )}
      {tail !== "left" && isFinite(criticalLow) && (
        <text
          x={toSX(criticalLow) + 4}
          y={PY + 22}
          fontSize="8"
          textAnchor="start"
          fill={RED}
        >
          {criticalLow.toFixed(3)}
        </text>
      )}

      {/* Axis labels */}
      <text x={PX + PLOT_W / 2} y={SVG_H - 1} fontSize="9" textAnchor="middle" fill="var(--ink-faint)">
        {type === "z" ? "Z 统计量" : `T 统计量 (df=${df})`}
      </text>

      {/* Rejection region label */}
      {(tail === "left" || tail === "two") && (
        <text x={PX + 12} y={PY + PLOT_H * 0.5} fontSize="8" fill={RED} opacity={0.8}>拒绝域</text>
      )}
      {(tail === "right" || tail === "two") && (
        <text x={PX + PLOT_W - 6} y={PY + PLOT_H * 0.5} fontSize="8" textAnchor="end" fill={RED} opacity={0.8}>拒绝域</text>
      )}
    </svg>
  );
}