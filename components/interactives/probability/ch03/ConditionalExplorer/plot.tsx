import { BAR_H, BAR_PAD, BAR_W, BAR_SLOT } from "./appearance";
interface BarChartProps {
  values: [number, number, number];
  color: string;
  label: string;
  xLabels: [string, string, string];
}

export function BarChart({ values, color, label, xLabels }: BarChartProps) {
  const maxVal = Math.max(...values, 0.001);
  const innerH = BAR_H - BAR_PAD - 14; // subtract top padding + x-label area

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-[11px] font-semibold px-2 py-0.5 rounded"
        style={{ background: color + "22", color }}
      >
        {label}
      </span>
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-full" style={{ maxWidth: BAR_W }}>
        {/* 基线 */}
        <line
          x1={BAR_PAD}
          y1={BAR_H - 20}
          x2={BAR_W - BAR_PAD}
          y2={BAR_H - 20}
          stroke="var(--line)"
          strokeWidth={1}
        />
        {/* 参考线 0.5 */}
        {[0.25, 0.5, 0.75].map((v) => {
          const yPos = (BAR_H - 20) - v * innerH;
          return (
            <g key={v}>
              <line
                x1={BAR_PAD}
                y1={yPos}
                x2={BAR_W - BAR_PAD}
                y2={yPos}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text x={BAR_PAD - 4} y={yPos + 3} fontSize="8" textAnchor="end" fill="var(--ink-faint)">
                {v}
              </text>
            </g>
          );
        })}
        {values.map((val, idx) => {
          const barH = (val / maxVal) * innerH;
          const barW = BAR_SLOT * 0.6;
          const cx = BAR_PAD + idx * BAR_SLOT + BAR_SLOT / 2;
          const bx = cx - barW / 2;
          const by = (BAR_H - 20) - barH;
          return (
            <g key={idx}>
              <rect
                x={bx}
                y={by}
                width={barW}
                height={barH}
                fill={color}
                opacity={0.85}
                rx={2}
              />
              <text
                x={cx}
                y={by - 3}
                fontSize="8.5"
                textAnchor="middle"
                fill={color}
                fontWeight="700"
              >
                {val.toFixed(3)}
              </text>
              <text
                x={cx}
                y={BAR_H - 6}
                fontSize="9"
                textAnchor="middle"
                fill="var(--ink-soft)"
              >
                {xLabels[idx]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}