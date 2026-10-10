import { chi2PDF, chi2Quantile } from "@/lib/learning/probability/varianceTest";
import type { TestResult, TailType } from "@/lib/learning/probability/varianceTest";
import { PX, PLOT_W, SVG_H, PY, PLOT_H, RED, ACCENT, SVG_W, GRAY_LINE } from "./appearance";
// ─── SVG helpers ─────────────────────────────────────────────────────────────
export function buildChi2Curve(xMin: number, xMax: number, df: number, pdfPeak: number): string {
  const steps = 300;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    const y = chi2PDF(x, df);
    const sx = PX + ((x - xMin) / (xMax - xMin)) * PLOT_W;
    const sy = SVG_H - PY - (y / pdfPeak) * PLOT_H * 0.88;
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

export function buildChi2Area(
  xMin: number,
  xMax: number,
  areaMin: number,
  areaMax: number,
  df: number,
  pdfPeak: number
): string {
  const clampedMin = Math.max(areaMin, xMin);
  const clampedMax = Math.min(areaMax, xMax);
  if (clampedMin >= clampedMax) return "";
  const toSX = (x: number) => PX + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const toSY = (y: number) => SVG_H - PY - (y / pdfPeak) * PLOT_H * 0.88;
  const baseline = SVG_H - PY;
  const steps = 200;
  const pts: string[] = [`M${toSX(clampedMin).toFixed(2)},${baseline}`];
  for (let i = 0; i <= steps; i++) {
    const x = clampedMin + (i / steps) * (clampedMax - clampedMin);
    const y = chi2PDF(x, df);
    pts.push(`L${toSX(x).toFixed(2)},${toSY(y).toFixed(2)}`);
  }
  pts.push(`L${toSX(clampedMax).toFixed(2)},${baseline}`, "Z");
  return pts.join(" ");
}

// ─── Distribution SVG ─────────────────────────────────────────────────────────
export interface DistSVGProps {
  result: TestResult;
  tail: TailType;
}

export function DistSVG({ result, tail }: DistSVGProps) {
  const { chi2Stat, df, criticalLow, criticalHigh } = result;

  // Determine plot range: χ²(df), mode = max(df-2, 0)
  const mode = Math.max(df - 2, 0.1);
  const xMax = Math.max(chi2Quantile(0.999, df), chi2Stat * 1.1, criticalHigh * 1.1, 2);
  const xMin = 0;

  // PDF peak for scaling (at mode)
  const pdfPeak = chi2PDF(mode, df);
  const safePeak = pdfPeak > 0 ? pdfPeak : 1;

  const toSX = (x: number) =>
    PX + ((Math.max(xMin, Math.min(xMax, x)) - xMin) / (xMax - xMin)) * PLOT_W;
  const toSY = (y: number) => SVG_H - PY - (y / safePeak) * PLOT_H * 0.88;
  const baseline = SVG_H - PY;

  const curvePath = buildChi2Curve(xMin, xMax, df, safePeak);

  // Rejection areas
  const rejLeftPath =
    tail === "left" || tail === "two"
      ? buildChi2Area(xMin, xMax, xMin, criticalLow, df, safePeak)
      : "";
  const rejRightPath =
    tail === "right" || tail === "two"
      ? buildChi2Area(xMin, xMax, criticalHigh, xMax, df, safePeak)
      : "";

  // Stat marker position
  const statSX = toSX(chi2Stat);
  const statSY = toSY(chi2PDF(Math.max(0.01, Math.min(xMax, chi2Stat)), df));
  const statColor = result.reject ? RED : ACCENT;

  // X-axis tick marks (evenly spaced, avoid clutter)
  const tickStep = df <= 10 ? 2 : df <= 30 ? 5 : df <= 60 ? 10 : 20;
  const ticks: number[] = [];
  for (let v = 0; v <= xMax; v += tickStep) ticks.push(v);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full rounded-lg border border-[var(--line)]"
    >
      {/* Background */}
      <rect x={PX} y={PY} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" stroke={GRAY_LINE} />

      {/* X-axis ticks */}
      {ticks.map((v) => {
        const sx = toSX(v);
        if (sx < PX || sx > PX + PLOT_W) return null;
        return (
          <g key={v}>
            <line x1={sx} y1={baseline} x2={sx} y2={baseline + 3} stroke="var(--ink-faint)" />
            <text x={sx} y={baseline + 12} fontSize="8" textAnchor="middle" fill="var(--ink-faint)">
              {v}
            </text>
          </g>
        );
      })}

      {/* Rejection areas */}
      {rejLeftPath && <path d={rejLeftPath} fill={RED} opacity={0.2} />}
      {rejRightPath && <path d={rejRightPath} fill={RED} opacity={0.2} />}

      {/* Distribution curve */}
      <path d={curvePath} fill="none" stroke={ACCENT} strokeWidth="2" />

      {/* Critical value lines */}
      {(tail === "left" || tail === "two") && isFinite(criticalLow) && criticalLow > 0 && (
        <>
          <line
            x1={toSX(criticalLow)}
            y1={PY}
            x2={toSX(criticalLow)}
            y2={baseline}
            stroke={RED}
            strokeDasharray="4 3"
            strokeWidth="1.4"
          />
          <text
            x={toSX(criticalLow) - 4}
            y={PY + 14}
            fontSize="8"
            textAnchor="end"
            fill={RED}
            fontWeight="bold"
          >
            χ²α/2={criticalLow.toFixed(3)}
          </text>
        </>
      )}
      {(tail === "right" || tail === "two") && isFinite(criticalHigh) && (
        <>
          <line
            x1={toSX(criticalHigh)}
            y1={PY}
            x2={toSX(criticalHigh)}
            y2={baseline}
            stroke={RED}
            strokeDasharray="4 3"
            strokeWidth="1.4"
          />
          <text
            x={toSX(criticalHigh) + 4}
            y={PY + 14}
            fontSize="8"
            textAnchor="start"
            fill={RED}
            fontWeight="bold"
          >
            χ²1-α{tail === "two" ? "/2" : ""}={criticalHigh.toFixed(3)}
          </text>
        </>
      )}

      {/* Test statistic marker */}
      {isFinite(chi2Stat) && chi2Stat >= 0 && statSX >= PX && statSX <= PX + PLOT_W && (
        <>
          <line
            x1={statSX}
            y1={PY}
            x2={statSX}
            y2={baseline}
            stroke={statColor}
            strokeWidth="2.2"
          />
          <circle cx={statSX} cy={statSY} r="4.5" fill={statColor} />
          {/* Triangle marker */}
          <polygon
            points={`${statSX},${baseline - 6} ${statSX - 5},${baseline + 4} ${statSX + 5},${baseline + 4}`}
            fill={statColor}
          />
          <text
            x={Math.min(Math.max(statSX, PX + 20), PX + PLOT_W - 20)}
            y={PY + 24}
            fontSize="9"
            textAnchor="middle"
            fill={statColor}
            fontWeight="bold"
          >
            χ²={chi2Stat.toFixed(3)}
          </text>
        </>
      )}

      {/* Rejection region labels */}
      {(tail === "left" || tail === "two") && rejLeftPath && (
        <text x={PX + 6} y={PY + PLOT_H * 0.55} fontSize="8" fill={RED} opacity={0.9}>
          拒绝域
        </text>
      )}
      {(tail === "right" || tail === "two") && rejRightPath && (
        <text
          x={PX + PLOT_W - 6}
          y={PY + PLOT_H * 0.55}
          fontSize="8"
          textAnchor="end"
          fill={RED}
          opacity={0.9}
        >
          拒绝域
        </text>
      )}

      {/* Axis label */}
      <text
        x={PX + PLOT_W / 2}
        y={SVG_H - 1}
        fontSize="9"
        textAnchor="middle"
        fill="var(--ink-faint)"
      >
        χ²({df}) 统计量
      </text>
    </svg>
  );
}