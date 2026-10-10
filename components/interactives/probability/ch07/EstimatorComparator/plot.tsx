import { PAD_T, PLOT_H, PAD_L, PLOT_W, RED, ORANGE, GRAY_LINE } from "./appearance";
interface BoxData {
  label: string;
  color: string;
  q5: [number, number, number, number, number]; // [min,Q1,med,Q3,max]
  mean: number;
  trueVal: number;
  biasLabel: string;
  biasColor: string;
}

// ─── 坐标映射（给定轴域 [vMin, vMax] → SVG Y 坐标）────────────────────────────
export function makeScale(vMin: number, vMax: number) {
  return {
    y: (v: number) =>
      PAD_T + PLOT_H - ((v - vMin) / (vMax - vMin)) * PLOT_H,
    x: (frac: number) => PAD_L + frac * PLOT_W,
  };
}

// ─── 单个箱线图组件 ──────────────────────────────────────────────────────────
interface BoxPlotProps {
  data: BoxData;
  vMin: number;
  vMax: number;
  cx: number;     // 中心 x（分数）
  halfW: number;  // 半宽（分数）
}

export function BoxPlot({ data, vMin, vMax, cx, halfW }: BoxPlotProps) {
  const sc = makeScale(vMin, vMax);
  const x0 = sc.x(cx - halfW);
  const x1 = sc.x(cx);
  const x2 = sc.x(cx + halfW);
  const [min5, q1, med, q3, max5] = data.q5;

  const yMin = sc.y(Math.max(min5, vMin));
  const yQ1  = sc.y(Math.min(Math.max(q1,  vMin), vMax));
  const yMed = sc.y(Math.min(Math.max(med, vMin), vMax));
  const yQ3  = sc.y(Math.min(Math.max(q3,  vMin), vMax));
  const yMax = sc.y(Math.min(max5, vMax));
  const yMean = sc.y(Math.min(Math.max(data.mean, vMin), vMax));
  const yTrue = sc.y(Math.min(Math.max(data.trueVal, vMin), vMax));

  return (
    <g>
      {/* 胡须 */}
      <line x1={x1} y1={yMin} x2={x1} y2={yQ1} stroke={data.color} strokeWidth={1.5} strokeDasharray="3 2" />
      <line x1={x1} y1={yMax} x2={x1} y2={yQ3} stroke={data.color} strokeWidth={1.5} strokeDasharray="3 2" />
      {/* 胡须端帽 */}
      <line x1={x0 + (x2 - x0) * 0.3} y1={yMin} x2={x2 - (x2 - x0) * 0.3} y2={yMin} stroke={data.color} strokeWidth={1.2} />
      <line x1={x0 + (x2 - x0) * 0.3} y1={yMax} x2={x2 - (x2 - x0) * 0.3} y2={yMax} stroke={data.color} strokeWidth={1.2} />
      {/* 箱体 */}
      <rect
        x={x0}
        y={Math.min(yQ1, yQ3)}
        width={x2 - x0}
        height={Math.abs(yQ1 - yQ3)}
        fill={data.color + "28"}
        stroke={data.color}
        strokeWidth={1.8}
        rx={3}
      />
      {/* 中位数线 */}
      <line x1={x0} y1={yMed} x2={x2} y2={yMed} stroke={data.color} strokeWidth={2.5} />
      {/* 均值菱形 */}
      <polygon
        points={`${x1},${yMean - 5} ${x1 + 4},${yMean} ${x1},${yMean + 5} ${x1 - 4},${yMean}`}
        fill={data.color}
        opacity={0.85}
      />
      {/* 真实参数值红色虚线 */}
      <line
        x1={x0 - 6}
        y1={yTrue}
        x2={x2 + 6}
        y2={yTrue}
        stroke={RED}
        strokeWidth={1.8}
        strokeDasharray="5 3"
      />
      {/* 均值距真值的偏差指示箭头（竖向括号） */}
      {Math.abs(yMean - yTrue) > 3 && (
        <g>
          <line x1={x2 + 4} y1={yTrue} x2={x2 + 4} y2={yMean} stroke={ORANGE} strokeWidth={1.5} />
          <line x1={x2 + 1} y1={yTrue} x2={x2 + 7} y2={yTrue} stroke={ORANGE} strokeWidth={1.5} />
          <line x1={x2 + 1} y1={yMean} x2={x2 + 7} y2={yMean} stroke={ORANGE} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}

// ─── Y 轴刻度 ────────────────────────────────────────────────────────────────
export function YAxis({ vMin, vMax, ticks, label }: { vMin: number; vMax: number; ticks: number[]; label: string }) {
  const sc = makeScale(vMin, vMax);
  return (
    <g>
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke={GRAY_LINE} strokeWidth={1} />
      {ticks.map((v) => {
        const y = sc.y(v);
        if (y < PAD_T - 2 || y > PAD_T + PLOT_H + 2) return null;
        return (
          <g key={v}>
            <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke="var(--line)" strokeWidth={1} />
            <line x1={PAD_L} y1={y} x2={PAD_L + PLOT_W} y2={y} stroke={GRAY_LINE} strokeWidth={0.6} />
            <text x={PAD_L - 6} y={y + 3.5} fontSize={10} textAnchor="end" fill="var(--ink-faint)">
              {v % 1 === 0 ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      <text
        x={10}
        y={PAD_T + PLOT_H / 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-faint)"
        transform={`rotate(-90, 10, ${PAD_T + PLOT_H / 2})`}
      >
        {label}
      </text>
    </g>
  );
}