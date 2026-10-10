import { momentEstimate } from "@/lib/learning/probability/momentEstimation";
import type { DistType } from "@/lib/learning/probability/momentEstimation";
import { ACCENT, GREEN, ORANGE, PAD_L, CHART_W, PAD_T, CHART_H, SVG_W, SVG_H, GRAY_LINE } from "./appearance";
// ─── 收敛折线图数据 ────────────────────────────────────────────────
// 用固定随机种子（伪随机序列）演示：n 从 5 → 200 时，矩估计量与真实值对比
// 注意：每次用户点击"重新模拟"时才会重新生成

export interface ConvergenceSeries {
  ns: number[];
  trueVals: number[][];   // 每个参数的真实值（常数）
  estVals: number[][];    // 每个参数的矩估计序列
  paramLabels: string[];
  colors: string[];
}

export function buildConvergenceSeries(
  dist: DistType,
  trueParams: number[],
  bigSample: number[]
): ConvergenceSeries {
  const ns: number[] = [];
  const maxN = bigSample.length;
  // 采样点：5,8,12,18,25,35,50,70,100,140,200 (若 maxN>=200)
  const checkpoints = [5, 8, 12, 18, 25, 35, 50, 70, 100, 140, 200];
  for (const n of checkpoints) {
    if (n <= maxN) ns.push(n);
  }
  if (ns[ns.length - 1] !== maxN) ns.push(maxN);

  let paramLabels: string[];
  let colors: string[];
  let trueValuesList: number[][];

  if (dist === "exponential") {
    paramLabels = ["λ̂（矩估计）"];
    colors = [ACCENT];
    trueValuesList = [[trueParams[0]]];
  } else if (dist === "normal") {
    paramLabels = ["μ̂（矩估计）", "σ̂（矩估计）"];
    colors = [ACCENT, GREEN];
    trueValuesList = [[trueParams[0]], [trueParams[1]]];
  } else {
    paramLabels = ["â（矩估计）", "b̂（矩估计）"];
    colors = [ACCENT, ORANGE];
    trueValuesList = [[trueParams[0]], [trueParams[1]]];
  }

  // 对每个 n，截取前 n 个样本做矩估计
  const estVals: number[][] = paramLabels.map(() => []);

  for (const n of ns) {
    const slice = bigSample.slice(0, n);
    const est = momentEstimate(dist, slice);
    if (dist === "exponential") {
      estVals[0].push(isFinite(est.params.lambda) ? est.params.lambda : NaN);
    } else if (dist === "normal") {
      estVals[0].push(isFinite(est.params.mu) ? est.params.mu : NaN);
      estVals[1].push(isFinite(est.params.sigma) ? est.params.sigma : NaN);
    } else {
      estVals[0].push(isFinite(est.params.a) ? est.params.a : NaN);
      estVals[1].push(isFinite(est.params.b) ? est.params.b : NaN);
    }
  }

  return {
    ns,
    trueVals: trueValuesList,
    estVals,
    paramLabels,
    colors,
  };
}

// ─── 折线图 SVG ───────────────────────────────────────────────────
export function ConvergenceChart({ series }: { series: ConvergenceSeries }) {
  const { ns, trueVals, estVals, paramLabels, colors } = series;
  if (ns.length < 2) return null;

  // 收集所有值以确定 y 轴范围
  const allVals: number[] = [];
  for (const arr of estVals) for (const v of arr) if (isFinite(v)) allVals.push(v);
  for (const arr of trueVals) for (const v of arr) if (isFinite(v)) allVals.push(v);
  if (allVals.length === 0) return null;

  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const ySpan = yMax - yMin || 1;
  const yPad = ySpan * 0.2;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const nMin = ns[0];
  const nMax = ns[ns.length - 1];

  function sx(n: number): number {
    return PAD_L + ((n - nMin) / (nMax - nMin)) * CHART_W;
  }
  function sy(v: number): number {
    return PAD_T + CHART_H * (1 - (v - yLo) / (yHi - yLo));
  }

  // Y 轴刻度（5个）
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yLo + (i / 4) * (yHi - yLo));
  }
  // X 轴刻度
  const xTicks = [ns[0], ...ns.filter((n, i) => i > 0 && i < ns.length - 1 && i % 3 === 0), ns[ns.length - 1]];

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg border border-[var(--line)]" style={{ background: "var(--bg-muted)" }}>
      {/* 网格 */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={sy(v)} x2={PAD_L + CHART_W} y2={sy(v)} stroke={GRAY_LINE} strokeWidth={1} />
          <text x={PAD_L - 5} y={sy(v) + 3.5} fontSize="9" textAnchor="end" fill="var(--ink-faint)">
            {Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(0)}
          </text>
        </g>
      ))}
      {xTicks.map((n, i) => (
        <g key={i}>
          <line x1={sx(n)} y1={PAD_T} x2={sx(n)} y2={PAD_T + CHART_H} stroke={GRAY_LINE} strokeWidth={1} />
          <text x={sx(n)} y={PAD_T + CHART_H + 14} fontSize="9" textAnchor="middle" fill="var(--ink-faint)">{n}</text>
        </g>
      ))}

      {/* 轴线 */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H} stroke="var(--line)" />
      <line x1={PAD_L} y1={PAD_T + CHART_H} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H} stroke="var(--line)" />

      {/* 真实值水平参考线 */}
      {trueVals.map((arr, pi) => {
        const tv = arr[0];
        if (!isFinite(tv)) return null;
        const tyy = sy(tv);
        if (tyy < PAD_T - 2 || tyy > PAD_T + CHART_H + 2) return null;
        return (
          <g key={pi}>
            <line
              x1={PAD_L}
              y1={tyy}
              x2={PAD_L + CHART_W}
              y2={tyy}
              stroke={colors[pi]}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              opacity={0.5}
            />
            <text
              x={PAD_L + CHART_W - 2}
              y={tyy - 3}
              fontSize="9"
              textAnchor="end"
              fill={colors[pi]}
              opacity={0.7}
            >
              真值
            </text>
          </g>
        );
      })}

      {/* 矩估计折线 */}
      {estVals.map((arr, pi) => {
        const pts = arr.map((v, i) => ({ x: sx(ns[i]), y: isFinite(v) ? sy(v) : null }));
        const segments: string[] = [];
        let cmd = "M";
        for (const pt of pts) {
          if (pt.y === null) { cmd = "M"; continue; }
          segments.push(`${cmd}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`);
          cmd = "L";
        }
        return (
          <g key={pi}>
            <path d={segments.join(" ")} fill="none" stroke={colors[pi]} strokeWidth={2} />
            {pts.map((pt, i) =>
              pt.y !== null ? (
                <circle key={i} cx={pt.x} cy={pt.y} r={3} fill={colors[pi]} stroke="white" strokeWidth={1} />
              ) : null
            )}
          </g>
        );
      })}

      {/* 轴标签 */}
      <text x={PAD_L + CHART_W / 2} y={SVG_H - 4} fontSize="10" textAnchor="middle" fill="var(--ink-faint)">
        样本量 n
      </text>

      {/* 图例 */}
      {paramLabels.map((label, pi) => (
        <g key={pi}>
          <line
            x1={PAD_L + 4 + pi * 110}
            y1={PAD_T + 8}
            x2={PAD_L + 20 + pi * 110}
            y2={PAD_T + 8}
            stroke={colors[pi]}
            strokeWidth={2}
          />
          <text x={PAD_L + 23 + pi * 110} y={PAD_T + 11} fontSize="9" fill={colors[pi]}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}