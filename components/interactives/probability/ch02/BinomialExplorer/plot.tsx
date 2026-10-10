import { useMemo } from "react";
import { CHART_W, PAD_L, PAD_R, CHART_H, PAD_T, PAD_B, GRAY_BORDER } from "./appearance";
// ─── SVG 柱状图 ──────────────────────────────────────────────────────────────
interface BarChartProps {
  data: { k: number; p: number }[];
  mean: number;
  color: string;
  label: string;
}

export function BarChart({ data, mean, color, label }: BarChartProps) {
  const chartW = CHART_W - PAD_L - PAD_R;
  const chartH = CHART_H - PAD_T - PAD_B;
  const n = data.length;

  const maxP = Math.max(...data.map((d) => d.p), 0.001);
  const barW = Math.max(2, (chartW / n) * 0.72);
  const gap = chartW / n;

  // y 轴刻度：最多 5 档
  const yTicks = useMemo(() => {
    const raw = [0, 0.25, 0.5, 0.75, 1].map((f) => +(maxP * f).toFixed(4));
    return raw.filter((v) => v <= maxP + 0.001);
  }, [maxP]);

  const toX = (k: number) => PAD_L + (k + 0.5) * gap;
  const toY = (p: number) => PAD_T + chartH - (p / maxP) * chartH;

  // 均值线 x 坐标
  const meanX = PAD_L + ((mean / (n - 1)) * chartW);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full rounded-lg"
      style={{ maxHeight: 220 }}
      aria-label={label}
    >
      {/* 背景 */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={chartW}
        height={chartH}
        fill="var(--bg-elevated)"
        stroke={GRAY_BORDER}
        rx={2}
      />

      {/* y 轴刻度线 */}
      {yTicks.map((v) => {
        const y = toY(v);
        return (
          <g key={v}>
            <line
              x1={PAD_L}
              y1={y}
              x2={PAD_L + chartW}
              y2={y}
              stroke={GRAY_BORDER}
              strokeDasharray="3 3"
            />
            <text
              x={PAD_L - 5}
              y={y + 3}
              fontSize={9}
              textAnchor="end"
              fill="var(--ink-faint)"
            >
              {v < 0.01 ? v.toExponential(1) : v.toFixed(3)}
            </text>
          </g>
        );
      })}

      {/* 均值虚线 */}
      {mean >= 0 && mean <= n - 1 && (
        <>
          <line
            x1={meanX}
            y1={PAD_T}
            x2={meanX}
            y2={PAD_T + chartH}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            opacity={0.7}
          />
          <text
            x={meanX + 3}
            y={PAD_T + 10}
            fontSize={9}
            fill={color}
            fontWeight="600"
          >
            μ={mean.toFixed(2)}
          </text>
        </>
      )}

      {/* 柱状条 */}
      {data.map(({ k, p }) => {
        const x = toX(k) - barW / 2;
        const barH = (p / maxP) * chartH;
        const y = PAD_T + chartH - barH;
        return (
          <g key={k}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={color}
              rx={1.5}
              opacity={0.85}
            >
              <title>
                P(X={k}) = {p.toFixed(6)}
              </title>
            </rect>
          </g>
        );
      })}

      {/* x 轴标签（每隔几个显示一次，避免拥挤） */}
      {data.map(({ k }) => {
        const step = n <= 15 ? 1 : n <= 25 ? 2 : 5;
        if (k % step !== 0 && k !== n - 1) return null;
        return (
          <text
            key={k}
            x={toX(k)}
            y={PAD_T + chartH + 14}
            fontSize={9}
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            {k}
          </text>
        );
      })}

      {/* 轴标签 */}
      <text
        x={PAD_L + chartW / 2}
        y={CHART_H - 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-faint)"
      >
        k（X 的取值）
      </text>
      <text
        x={9}
        y={PAD_T + chartH / 2}
        fontSize={9}
        textAnchor="middle"
        fill="var(--ink-faint)"
        transform={`rotate(-90, 9, ${PAD_T + chartH / 2})`}
      >
        P(X=k)
      </text>
    </svg>
  );
}