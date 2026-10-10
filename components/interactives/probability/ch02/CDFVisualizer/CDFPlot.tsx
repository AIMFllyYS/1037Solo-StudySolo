import { SVG_W, SVG_H, PAD_L, PAD_T, PLOT_W, PLOT_H, BG_MUTED, LINE, INK_SOFT, ACCENT_FILL, ORANGE, ACCENT, GREEN } from "./appearance";
import { yToSvg, xToSvg } from "./geometry";
import type { CdfScene } from './useCdfScene';
export function CDFPlot({ scene }: { scene: CdfScene }) {
  const { svgRef, viewMode, yTicksPDF, pdfMax, distType, showInterval, buildFillPath, xVal, buildIntervalFillPath, aVal, bVal, buildPDFPath, binomBars, baseLineY, xSvg, dragX, aSvg, dragA, bSvg, dragB, yTicksCDF, buildCDFPath, buildBinomCDFPath, fxSvgY_cdf, fxVal, getCDF, loAB, hiAB, xMin, xMax, xTicks, distName } = scene;
  return (<svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full select-none touch-none rounded-lg border border-[var(--line)]"
        style={{ maxHeight: 240, cursor: "ew-resize" }}
      >
        {/* 背景 */}
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill={BG_MUTED} />

        {/* ── PDF / PMF 视图 ──────────────────────────────────── */}
        {viewMode === "pdf" && (
          <>
            {/* y 轴网格 */}
            {yTicksPDF.map((v) => {
              const sy = yToSvg(v, pdfMax);
              return (
                <g key={v}>
                  <line x1={PAD_L} y1={sy} x2={PAD_L + PLOT_W} y2={sy} stroke={LINE} strokeWidth={0.8} />
                  <text x={PAD_L - 4} y={sy + 3} fontSize={9} textAnchor="end" fill={INK_SOFT}>
                    {v.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* 连续分布：左侧阴影（F(x) 面积）或区间阴影 */}
            {distType !== "binomial" && !showInterval && (
              <path d={buildFillPath(xVal)} fill={ACCENT_FILL} stroke="none" />
            )}
            {distType !== "binomial" && showInterval && (
              <path d={buildIntervalFillPath(aVal, bVal)} fill={`${ORANGE}33`} stroke="none" />
            )}

            {/* 连续分布：PDF 曲线 */}
            {distType !== "binomial" && (
              <path d={buildPDFPath()} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />
            )}

            {/* 离散分布：PMF bars */}
            {distType === "binomial" &&
              binomBars.map(({ k, sx, sy, barH, barW, fill }) => (
                <rect
                  key={k}
                  x={sx - barW / 2}
                  y={sy}
                  width={barW}
                  height={barH}
                  fill={fill}
                  rx={2}
                  opacity={0.85}
                />
              ))}

            {/* x 轴 */}
            <line x1={PAD_L} y1={baseLineY} x2={PAD_L + PLOT_W} y2={baseLineY} stroke={LINE} strokeWidth={1} />

            {/* ─ 单滑块模式的竖线 ─ */}
            {!showInterval && (
              <g>
                {/* 阴影竖线 */}
                <line
                  x1={xSvg} y1={PAD_T}
                  x2={xSvg} y2={baseLineY}
                  stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3"
                />
                {/* 拖拽手柄 */}
                <g
                  {...dragX}
                  style={{ cursor: "ew-resize" }}
                >
                  <rect
                    x={xSvg - 10} y={PAD_T}
                    width={20} height={PLOT_H}
                    fill="transparent"
                  />
                  <circle cx={xSvg} cy={baseLineY} r={7} fill={ACCENT} stroke="white" strokeWidth={1.5} />
                  <text
                    x={xSvg}
                    y={baseLineY + 16}
                    fontSize={10}
                    textAnchor="middle"
                    fill={ACCENT}
                    fontWeight="bold"
                  >
                    x
                  </text>
                </g>
              </g>
            )}

            {/* ─ 区间模式：a 和 b 滑块 ─ */}
            {showInterval && (
              <>
                {/* a 竖线 */}
                <line x1={aSvg} y1={PAD_T} x2={aSvg} y2={baseLineY} stroke={GREEN} strokeWidth={1.5} strokeDasharray="4 3" />
                <g {...dragA} style={{ cursor: "ew-resize" }}>
                  <rect x={aSvg - 10} y={PAD_T} width={20} height={PLOT_H} fill="transparent" />
                  <circle cx={aSvg} cy={baseLineY} r={7} fill={GREEN} stroke="white" strokeWidth={1.5} />
                  <text x={aSvg} y={baseLineY + 16} fontSize={10} textAnchor="middle" fill={GREEN} fontWeight="bold">a</text>
                </g>
                {/* b 竖线 */}
                <line x1={bSvg} y1={PAD_T} x2={bSvg} y2={baseLineY} stroke={ORANGE} strokeWidth={1.5} strokeDasharray="4 3" />
                <g {...dragB} style={{ cursor: "ew-resize" }}>
                  <rect x={bSvg - 10} y={PAD_T} width={20} height={PLOT_H} fill="transparent" />
                  <circle cx={bSvg} cy={baseLineY} r={7} fill={ORANGE} stroke="white" strokeWidth={1.5} />
                  <text x={bSvg} y={baseLineY + 16} fontSize={10} textAnchor="middle" fill={ORANGE} fontWeight="bold">b</text>
                </g>
              </>
            )}
          </>
        )}

        {/* ── CDF 视图 ─────────────────────────────────────────── */}
        {viewMode === "cdf" && (
          <>
            {/* y 轴网格 */}
            {yTicksCDF.map((v) => {
              const sy = yToSvg(v, 1);
              return (
                <g key={v}>
                  <line x1={PAD_L} y1={sy} x2={PAD_L + PLOT_W} y2={sy} stroke={v === 0 ? LINE : LINE} strokeWidth={0.8} />
                  <text x={PAD_L - 4} y={sy + 3} fontSize={9} textAnchor="end" fill={INK_SOFT}>
                    {v.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* 连续 CDF 曲线 */}
            {distType !== "binomial" && (
              <path d={buildCDFPath()} fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinejoin="round" />
            )}

            {/* 离散 CDF 阶梯 */}
            {distType === "binomial" && (
              <path d={buildBinomCDFPath()} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />
            )}

            {/* x 轴 */}
            <line x1={PAD_L} y1={baseLineY} x2={PAD_L + PLOT_W} y2={baseLineY} stroke={LINE} strokeWidth={1} />

            {/* F(x) 读取线（水平+竖直虚线 → 点） */}
            {!showInterval && (
              <g>
                {/* 竖线 */}
                <line x1={xSvg} y1={PAD_T} x2={xSvg} y2={fxSvgY_cdf} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" />
                {/* 水平线到 y 轴 */}
                <line x1={PAD_L} y1={fxSvgY_cdf} x2={xSvg} y2={fxSvgY_cdf} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" />
                {/* y 轴上的数值标注 */}
                <rect x={0} y={fxSvgY_cdf - 8} width={PAD_L - 4} height={14} fill="var(--bg-elevated)" rx={2} />
                <text x={PAD_L - 5} y={fxSvgY_cdf + 4} fontSize={9.5} textAnchor="end" fill={ACCENT} fontWeight="bold">
                  {fxVal.toFixed(3)}
                </text>
                {/* 交叉点 */}
                <circle cx={xSvg} cy={fxSvgY_cdf} r={4.5} fill={ACCENT} stroke="white" strokeWidth={1.5} />
                {/* 拖拽手柄 */}
                <g {...dragX} style={{ cursor: "ew-resize" }}>
                  <rect x={xSvg - 10} y={PAD_T} width={20} height={PLOT_H} fill="transparent" />
                  <circle cx={xSvg} cy={baseLineY} r={7} fill={ACCENT} stroke="white" strokeWidth={1.5} />
                  <text x={xSvg} y={baseLineY + 16} fontSize={10} textAnchor="middle" fill={ACCENT} fontWeight="bold">x</text>
                </g>
              </g>
            )}

            {/* 区间模式 CDF：F(b) - F(a) */}
            {showInterval && (
              <>
                {/* a 滑块 */}
                <line x1={aSvg} y1={PAD_T} x2={aSvg} y2={baseLineY} stroke={GREEN} strokeWidth={1.5} strokeDasharray="4 3" />
                <g {...dragA} style={{ cursor: "ew-resize" }}>
                  <rect x={aSvg - 10} y={PAD_T} width={20} height={PLOT_H} fill="transparent" />
                  <circle cx={aSvg} cy={baseLineY} r={7} fill={GREEN} stroke="white" strokeWidth={1.5} />
                  <text x={aSvg} y={baseLineY + 16} fontSize={10} textAnchor="middle" fill={GREEN} fontWeight="bold">a</text>
                </g>
                {/* b 滑块 */}
                <line x1={bSvg} y1={PAD_T} x2={bSvg} y2={baseLineY} stroke={ORANGE} strokeWidth={1.5} strokeDasharray="4 3" />
                <g {...dragB} style={{ cursor: "ew-resize" }}>
                  <rect x={bSvg - 10} y={PAD_T} width={20} height={PLOT_H} fill="transparent" />
                  <circle cx={bSvg} cy={baseLineY} r={7} fill={ORANGE} stroke="white" strokeWidth={1.5} />
                  <text x={bSvg} y={baseLineY + 16} fontSize={10} textAnchor="middle" fill={ORANGE} fontWeight="bold">b</text>
                </g>
                {/* F(a) 水平线 */}
                {(() => {
                  const fa = getCDF(loAB);
                  const fb = getCDF(hiAB);
                  const sFa = yToSvg(fa, 1);
                  const sFb = yToSvg(fb, 1);
                  const sA = xToSvg(loAB, xMin, xMax);
                  const sB = xToSvg(hiAB, xMin, xMax);
                  return (
                    <>
                      <line x1={PAD_L} y1={sFa} x2={sA} y2={sFa} stroke={GREEN} strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />
                      <line x1={PAD_L} y1={sFb} x2={sB} y2={sFb} stroke={ORANGE} strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />
                      <text x={PAD_L - 4} y={sFa + 4} fontSize={8.5} textAnchor="end" fill={GREEN} fontWeight="bold">{fa.toFixed(3)}</text>
                      <text x={PAD_L - 4} y={sFb + 4} fontSize={8.5} textAnchor="end" fill={ORANGE} fontWeight="bold">{fb.toFixed(3)}</text>
                      {/* 标注 F(b)-F(a) 的双向箭头 */}
                      <line x1={PAD_L - 14} y1={sFa} x2={PAD_L - 14} y2={sFb} stroke={ACCENT} strokeWidth={1.5} markerStart="url(#arrowUp)" markerEnd="url(#arrowDown)" />
                    </>
                  );
                })()}
              </>
            )}

            {/* Arrow marker defs */}
            <defs>
              <marker id="arrowUp" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M3,6 L0,3 L6,3 Z" fill={ACCENT} />
              </marker>
              <marker id="arrowDown" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
                <path d="M3,0 L0,3 L6,3 Z" fill={ACCENT} />
              </marker>
            </defs>
          </>
        )}

        {/* x 轴刻度 */}
        {xTicks.map((v) => {
          const sx = xToSvg(v, xMin, xMax);
          return (
            <g key={v}>
              <line x1={sx} y1={baseLineY} x2={sx} y2={baseLineY + 4} stroke={INK_SOFT} strokeWidth={0.8} />
              <text x={sx} y={baseLineY + 13} fontSize={9} textAnchor="middle" fill={INK_SOFT}>
                {distType === "binomial" ? v : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* y 轴标签 */}
        <text
          x={PAD_L - 22}
          y={PAD_T + PLOT_H / 2}
          fontSize={9}
          fill={INK_SOFT}
          textAnchor="middle"
          transform={`rotate(-90, ${PAD_L - 22}, ${PAD_T + PLOT_H / 2})`}
        >
          {viewMode === "pdf" ? (distType === "binomial" ? "P(X=k)" : "f(x)") : "F(x)"}
        </text>

        {/* 分布名标签 */}
        <text x={PAD_L + PLOT_W - 4} y={PAD_T + 12} fontSize={10} textAnchor="end" fill={ACCENT} fontWeight="bold">
          {distName}
        </text>
      </svg>);
}
