import { AX_L, AX_R, SVG_W, SVG_H, AX_Y, ACCENT_LIGHT, GRAY_LINE, ACCENT, ORANGE } from "./appearance";
import { fmt } from "./formatters";
interface NumberLineProps {
  data: number[];
  mean: number;
  stdN1: number;
  useBiased: boolean;
}

export function NumberLine({ data, mean, stdN1, useBiased }: NumberLineProps) {
  if (data.length === 0) return null;

  const stdUsed = useBiased
    ? Math.sqrt(data.reduce((s, x) => s + (x - mean) ** 2, 0) / data.length)
    : stdN1;

  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const span = maxV - minV || 1;
  const padded = span * 0.18;
  const lo = minV - padded;
  const hi = maxV + padded;

  function toX(v: number): number {
    return AX_L + ((v - lo) / (hi - lo)) * (AX_R - AX_L);
  }

  const meanX = toX(mean);
  const lo1X = toX(mean - stdUsed);
  const hi1X = toX(mean + stdUsed);

  // 刻度：min, mean, max
  const ticks = Array.from(new Set([minV, mean, maxV]));

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full">
      {/* X̄±S 区间 */}
      {stdUsed > 0 && (
        <rect
          x={Math.max(AX_L, lo1X)}
          y={AX_Y - 18}
          width={Math.max(0, Math.min(hi1X, AX_R) - Math.max(lo1X, AX_L))}
          height={36}
          fill={ACCENT_LIGHT}
          opacity={0.7}
          rx={4}
        />
      )}

      {/* 轴线 */}
      <line x1={AX_L} y1={AX_Y} x2={AX_R} y2={AX_Y} stroke={GRAY_LINE} strokeWidth={1.5} />

      {/* 刻度 */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={toX(v)} y1={AX_Y - 4} x2={toX(v)} y2={AX_Y + 4} stroke="var(--ink-faint)" strokeWidth={1} />
          <text x={toX(v)} y={AX_Y + 16} fontSize="9" textAnchor="middle" fill="var(--ink-faint)">
            {fmt(v, 1)}
          </text>
        </g>
      ))}

      {/* 数据点 */}
      {data.map((v, i) => (
        <circle
          key={i}
          cx={toX(v)}
          cy={AX_Y}
          r={5}
          fill="white"
          stroke={ACCENT}
          strokeWidth={1.8}
          opacity={0.85}
        />
      ))}

      {/* X̄ 标记 */}
      <line x1={meanX} y1={AX_Y - 22} x2={meanX} y2={AX_Y + 8} stroke={ORANGE} strokeWidth={2} />
      <text x={meanX} y={AX_Y - 26} fontSize="10" textAnchor="middle" fill={ORANGE} fontWeight="700">
        X̄={fmt(mean, 2)}
      </text>

      {/* ±S 标签 */}
      {stdUsed > 0 && (
        <>
          <text x={lo1X} y={AX_Y - 22} fontSize="8" textAnchor="middle" fill={ACCENT} opacity={0.9}>
            X̄−S
          </text>
          <text x={hi1X} y={AX_Y - 22} fontSize="8" textAnchor="middle" fill={ACCENT} opacity={0.9}>
            X̄+S
          </text>
        </>
      )}

      {/* 图例标注 */}
      <circle cx={AX_L + 4} cy={18} r={4} fill="white" stroke={ACCENT} strokeWidth={1.6} />
      <text x={AX_L + 11} y={22} fontSize="9" fill="var(--ink-faint)">样本点</text>
      <line x1={AX_L + 38} y1={14} x2={AX_L + 38} y2={24} stroke={ORANGE} strokeWidth={2} />
      <text x={AX_L + 44} y={22} fontSize="9" fill="var(--ink-faint)">均值 X̄</text>
      <rect x={AX_L + 72} y={14} width={10} height={10} fill={ACCENT_LIGHT} rx={2} />
      <text x={AX_L + 85} y={22} fontSize="9" fill="var(--ink-faint)">X̄±S 范围</text>
    </svg>
  );
}