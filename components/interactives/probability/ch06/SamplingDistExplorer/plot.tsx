import { PAD, PW, PH, SVG_W, SVG_H, GRAY_BG, GRAY_LINE } from "./appearance";
import type { CurveResult, TabId } from "@/lib/learning/probability/samplingDistributions";
export function sx(v: number, lo: number, hi: number): number {
  return PAD.left + ((v - lo) / (hi - lo)) * PW;
}
export function sy(v: number, lo: number, hi: number): number {
  return PAD.top + PH - ((v - lo) / (hi - lo)) * PH;
}

// ─── SVG 曲线图 ───────────────────────────────────────────────────────────────
export interface DistPlotProps {
  result: CurveResult;
  tabId: TabId;
  color: string;
  showNormal: boolean;
  alpha: number;
}

export function DistPlot({ result, tabId, color, showNormal, alpha }: DistPlotProps) {
  const { xs, ys, normYs, xLo, xHi, yMax, critical } = result;

  function px(x: number): number { return sx(x, xLo, xHi); }
  function py(y: number): number { return sy(y, 0, yMax); }

  // 主曲线路径
  const curvePath = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`)
    .join(" ");

  // 正态曲线路径
  const normPath = showNormal
    ? xs
        .map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(normYs[i]).toFixed(2)}`)
        .join(" ")
    : "";

  // 右尾阴影路径（主分布）
  const tailXs = xs.filter((x) => x >= critical);
  const tailPath =
    tailXs.length > 1
      ? [
          `M${px(critical).toFixed(2)},${py(0).toFixed(2)}`,
          ...tailXs.map((x) => `L${px(x).toFixed(2)},${py(ys[xs.indexOf(x)]).toFixed(2)}`),
          `L${px(tailXs[tailXs.length - 1]).toFixed(2)},${py(0).toFixed(2)}`,
          "Z",
        ].join(" ")
      : "";

  // t 分布左尾
  let leftTailPath = "";
  if (tabId === "t") {
    const leftTailXs = xs.filter((x) => x <= -critical);
    leftTailPath =
      leftTailXs.length > 1
        ? [
            `M${px(leftTailXs[0]).toFixed(2)},${py(0).toFixed(2)}`,
            ...leftTailXs.map((x) => `L${px(x).toFixed(2)},${py(ys[xs.indexOf(x)]).toFixed(2)}`),
            `L${px(-critical).toFixed(2)},${py(0).toFixed(2)}`,
            "Z",
          ].join(" ")
        : "";
  }

  // x 轴刻度
  const xRange = xHi - xLo;
  const xStep = xRange <= 10 ? 1 : xRange <= 30 ? 5 : xRange <= 60 ? 10 : 20;
  const xTickStart = Math.ceil(xLo / xStep) * xStep;
  const xTicks: number[] = [];
  for (let t = xTickStart; t <= xHi; t += xStep) xTicks.push(t);

  const yStep = yMax / 4;
  const yTicks = [yStep, 2 * yStep, 3 * yStep].map((v) => v);

  const critX = px(critical);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full rounded-lg border border-[var(--line)]"
      style={{ background: GRAY_BG }}
    >
      {/* 网格线 */}
      {yTicks.map((t, i) => (
        <line
          key={`yg${i}`}
          x1={PAD.left}
          y1={py(t)}
          x2={PAD.left + PW}
          y2={py(t)}
          stroke={GRAY_LINE}
          strokeWidth={1}
        />
      ))}
      {xTicks.map((t, i) => (
        <line
          key={`xg${i}`}
          x1={px(t)}
          y1={PAD.top}
          x2={px(t)}
          y2={PAD.top + PH}
          stroke={GRAY_LINE}
          strokeWidth={1}
        />
      ))}

      {/* 左尾面积（t 分布双侧） */}
      {tabId === "t" && leftTailPath && (
        <path d={leftTailPath} fill={color} opacity={0.25} />
      )}

      {/* 右尾面积 */}
      {tailPath && <path d={tailPath} fill={color} opacity={0.25} />}

      {/* 正态对照曲线 */}
      {showNormal && normPath && (
        <path
          d={normPath}
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.7}
        />
      )}

      {/* 主分布曲线 */}
      <path d={curvePath} fill="none" stroke={color} strokeWidth={2.2} />

      {/* 临界值竖线 */}
      {critical > xLo && critical < xHi && (
        <>
          <line
            x1={critX}
            y1={PAD.top}
            x2={critX}
            y2={PAD.top + PH}
            stroke={color}
            strokeWidth={1.8}
            strokeDasharray="4 3"
          />
          {tabId === "t" && (
            <line
              x1={px(-critical)}
              y1={PAD.top}
              x2={px(-critical)}
              y2={PAD.top + PH}
              stroke={color}
              strokeWidth={1.8}
              strokeDasharray="4 3"
            />
          )}
          {/* α 标注 */}
          <text
            x={Math.min(critX + 6, PAD.left + PW - 32)}
            y={PAD.top + 16}
            fontSize={10}
            fill={color}
            fontWeight="700"
          >
            α={alpha.toFixed(2)}
          </text>
        </>
      )}

      {/* 坐标轴 */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + PH}
        stroke="var(--ink-faint)"
        strokeWidth={1.5}
      />
      <line
        x1={PAD.left}
        y1={PAD.top + PH}
        x2={PAD.left + PW}
        y2={PAD.top + PH}
        stroke="var(--ink-faint)"
        strokeWidth={1.5}
      />

      {/* X 轴刻度 */}
      {xTicks.map((t, i) => (
        <g key={`xt${i}`}>
          <line
            x1={px(t)}
            y1={PAD.top + PH}
            x2={px(t)}
            y2={PAD.top + PH + 4}
            stroke="var(--ink-faint)"
            strokeWidth={1}
          />
          <text
            x={px(t)}
            y={PAD.top + PH + 14}
            fontSize={9}
            textAnchor="middle"
            fill="var(--ink-soft)"
          >
            {t % 1 === 0 ? t : t.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Y 轴刻度 */}
      {yTicks.map((t, i) => (
        <g key={`yt${i}`}>
          <line
            x1={PAD.left - 4}
            y1={py(t)}
            x2={PAD.left}
            y2={py(t)}
            stroke="var(--ink-faint)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={py(t) + 3}
            fontSize={8}
            textAnchor="end"
            fill="var(--ink-soft)"
          >
            {t.toFixed(2)}
          </text>
        </g>
      ))}

      {/* 轴标签 */}
      <text
        x={PAD.left + PW / 2}
        y={SVG_H - 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-soft)"
        fontWeight="600"
      >
        x
      </text>
      <text
        x={9}
        y={PAD.top + PH / 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-soft)"
        fontWeight="600"
        transform={`rotate(-90,9,${PAD.top + PH / 2})`}
      >
        f(x)
      </text>

      {/* 正态对照图例 */}
      {showNormal && (
        <g>
          <line
            x1={PAD.left + PW - 74}
            y1={PAD.top + 8}
            x2={PAD.left + PW - 54}
            y2={PAD.top + 8}
            stroke="var(--ink-faint)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
          <text
            x={PAD.left + PW - 50}
            y={PAD.top + 11}
            fontSize={9}
            fill="var(--ink-faint)"
          >
            N(0,1)
          </text>
        </g>
      )}
    </svg>
  );
}