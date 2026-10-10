import type { DistType } from "@/lib/learning/probability/estimation/likelihood";
import { svgX, svgY } from "./geometry";
import { SVG_W, PAD_L, CHART_W, PAD_T, CHART_H, CURSOR_COLOR, SVG_H, CURVE_COLOR, MLE_COLOR } from "./appearance";
import { fmt } from "./formatters";

import type * as React from "react";
import type { getThetaRange } from "@/lib/learning/probability/estimation/likelihood";
interface LikelihoodPlotProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  handleSvgMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleSvgMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleSvgMouseUp: () => void;
  handleSvgClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
  setCursorTheta: React.Dispatch<React.SetStateAction<number>>;
  xToTheta: (clientX: number) => number;
  yTickValues: number[];
  llMin: number;
  llMax: number;
  xTickValues: number[];
  tMin: number;
  tMax: number;
  dist: DistType;
  tRange: ReturnType<typeof getThetaRange>;
  curvePath: string;
  data: number[];
  mle: number;
  cxMLE: number;
  cyMLE: number;
  cxCursor: number;
  llAtCursor: number;
  cyCursor: number;
  cursorTheta: number;
}
export function LikelihoodPlot({ svgRef, handleSvgMouseDown, handleSvgMouseMove, handleSvgMouseUp, handleSvgClick, handleTouchMove, setCursorTheta, xToTheta, yTickValues, llMin, llMax, xTickValues, tMin, tMax, dist, tRange, curvePath, data, mle, cxMLE, cyMLE, cxCursor, llAtCursor, cyCursor, cursorTheta }: LikelihoodPlotProps) {
 return (<svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full rounded-lg border border-[var(--line)] cursor-crosshair select-none"
          style={{ background: "var(--bg-muted)", touchAction: "none" }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onClick={handleSvgClick}
          onTouchMove={handleTouchMove}
          onTouchStart={(e) => {
            if (e.touches.length > 0) setCursorTheta(xToTheta(e.touches[0].clientX));
          }}
        >
          {/* 绘图区背景 */}
          <rect x={PAD_L} y={PAD_T} width={CHART_W} height={CHART_H} fill="var(--bg-muted)" />

          {/* Y 轴网格线与刻度 */}
          {yTickValues.map((v) => {
            const yy = svgY(v, llMin, llMax);
            if (yy < PAD_T || yy > PAD_T + CHART_H + 1) return null;
            return (
              <g key={v}>
                <line
                  x1={PAD_L}
                  y1={yy}
                  x2={PAD_L + CHART_W}
                  y2={yy}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text x={PAD_L - 5} y={yy + 3.5} fontSize="9" textAnchor="end" fill="var(--ink-faint)">
                  {v >= -100 && v <= 100 ? v.toFixed(1) : v.toExponential(1)}
                </text>
              </g>
            );
          })}

          {/* X 轴网格线与刻度 */}
          {xTickValues.map((v, i) => {
            const xx = svgX(v, tMin, tMax);
            return (
              <g key={i}>
                <line
                  x1={xx}
                  y1={PAD_T}
                  x2={xx}
                  y2={PAD_T + CHART_H}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text x={xx} y={PAD_T + CHART_H + 14} fontSize="9" textAnchor="middle" fill="var(--ink-faint)">
                  {v.toFixed(dist === "exponential" ? 2 : 2)}
                </text>
              </g>
            );
          })}

          {/* 轴线 */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H} stroke="var(--line)" />
          <line x1={PAD_L} y1={PAD_T + CHART_H} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H} stroke="var(--line)" />

          {/* X 轴标签 */}
          <text
            x={PAD_L + CHART_W / 2}
            y={SVG_H - 4}
            fontSize="10"
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            θ（{tRange.label}{tRange.unit}）
          </text>

          {/* 对数似然曲线 */}
          {curvePath && (
            <path
              d={curvePath}
              fill="none"
              stroke={CURVE_COLOR}
              strokeWidth={2.2}
              opacity={0.85}
            />
          )}

          {/* 无数据提示 */}
          {data.length === 0 && (
            <text
              x={PAD_L + CHART_W / 2}
              y={PAD_T + CHART_H / 2}
              textAnchor="middle"
              fontSize="13"
              fill="var(--ink-faint)"
            >
              请输入样本数据
            </text>
          )}

          {/* MLE 峰值竖线 */}
          {data.length > 0 && isFinite(mle) && (
            <g>
              <line
                x1={cxMLE}
                y1={PAD_T}
                x2={cxMLE}
                y2={PAD_T + CHART_H}
                stroke={MLE_COLOR}
                strokeWidth={1.8}
                strokeDasharray="5 3"
              />
              {/* MLE 峰值标记（倒三角）*/}
              <polygon
                points={`${cxMLE},${cyMLE + 10} ${cxMLE - 5},${cyMLE + 18} ${cxMLE + 5},${cyMLE + 18}`}
                fill={MLE_COLOR}
              />
              <circle cx={cxMLE} cy={cyMLE} r={5} fill={MLE_COLOR} stroke="white" strokeWidth={1.5} />
              <text
                x={cxMLE + 7}
                y={PAD_T + 12}
                fontSize="10"
                fill={MLE_COLOR}
                fontWeight="bold"
              >
                θ̂ = {fmt(mle, 3)}
              </text>
            </g>
          )}

          {/* 当前游标竖线 */}
          {data.length > 0 && (
            <g>
              <line
                x1={cxCursor}
                y1={PAD_T}
                x2={cxCursor}
                y2={PAD_T + CHART_H}
                stroke={CURSOR_COLOR}
                strokeWidth={2}
                opacity={0.9}
              />
              {isFinite(llAtCursor) && (
                <>
                  <circle
                    cx={cxCursor}
                    cy={cyCursor}
                    r={5}
                    fill={CURSOR_COLOR}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  {/* 游标标签：logL 值 */}
                  <rect
                    x={Math.min(cxCursor + 8, PAD_L + CHART_W - 68)}
                    y={cyCursor - 9}
                    width={66}
                    height={16}
                    rx={4}
                    fill={CURSOR_COLOR}
                    opacity={0.92}
                  />
                  <text
                    x={Math.min(cxCursor + 8 + 33, PAD_L + CHART_W - 35)}
                    y={cyCursor + 3}
                    fontSize="10"
                    textAnchor="middle"
                    fill="white"
                    fontWeight="bold"
                  >
                    logL={llAtCursor.toFixed(2)}
                  </text>
                </>
              )}
              {/* 游标 θ 标签 */}
              <text
                x={Math.min(cxCursor + 4, PAD_L + CHART_W - 54)}
                y={PAD_T + CHART_H + 14}
                fontSize="9"
                fill={CURSOR_COLOR}
                fontWeight="bold"
              >
                θ={cursorTheta.toFixed(3)}
              </text>
            </g>
          )}

          {/* 图例 */}
          <g>
            <line
              x1={PAD_L + 4}
              y1={PAD_T + 8}
              x2={PAD_L + 20}
              y2={PAD_T + 8}
              stroke={CURVE_COLOR}
              strokeWidth={2}
            />
            <text x={PAD_L + 23} y={PAD_T + 11} fontSize="9" fill={CURVE_COLOR}>
              logL(θ)
            </text>
            {data.length > 0 && isFinite(mle) && (
              <>
                <circle cx={PAD_L + 70} cy={PAD_T + 8} r={4} fill={MLE_COLOR} />
                <text x={PAD_L + 77} y={PAD_T + 11} fontSize="9" fill={MLE_COLOR} fontWeight="bold">
                  MLE θ̂
                </text>
              </>
            )}
            <circle cx={PAD_L + 115} cy={PAD_T + 8} r={4} fill={CURSOR_COLOR} />
            <text x={PAD_L + 122} y={PAD_T + 11} fontSize="9" fill={CURSOR_COLOR}>
              当前 θ（可拖动）
            </text>
          </g>
        </svg>);
}
