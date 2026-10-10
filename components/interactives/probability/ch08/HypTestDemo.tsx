"use client";

import { standardNormalDensity as normPDF } from '@/lib/learning/probability/math/normal';
import { memo, useState, useCallback } from "react";
import { getCriticalValues, computePValue } from "@/lib/learning/probability/testing/normalHypothesis";
import type { TestType } from "@/lib/learning/probability/testing/normalHypothesis";
import { buildCurvePath, buildRejectPath, xToSvg, pdfToY } from "./HypTestDemo/geometry";
import { X_MIN, X_MAX, W, H, ACCENT, RED, GRAY_LINE, GRAY_TEXT, PT, GREEN, PL, ACCENT_LIGHT, RED_LIGHT, GREEN_LIGHT } from "./HypTestDemo/appearance";
import { TEST_LABELS, TEST_NOTES } from "./HypTestDemo/metadata";
import { fmt2, fmt4 } from "./HypTestDemo/formatters";
// ─── 主组件 ───────────────────────────────────────────────────
function HypTestDemoBase() {
  const [alpha, setAlpha] = useState(0.05);
  const [zStat, setZStat] = useState(1.8);
  const [testType, setTestType] = useState<TestType>("two");

  // 预计算
  const { zLeft, zRight } = getCriticalValues(alpha, testType);
  const pValue = computePValue(zStat, testType);
  const rejected = pValue < alpha;

  // 判断 z 是否落在拒绝域
  const zInRejectRegion =
    (testType === "left" && zLeft !== null && zStat <= zLeft) ||
    (testType === "right" && zRight !== null && zStat >= zRight) ||
    (testType === "two" &&
      zLeft !== null &&
      zRight !== null &&
      (zStat <= zLeft || zStat >= zRight));

  // 正态曲线路径（固定）
  const curvePath = buildCurvePath();

  // 拒绝域填充路径
  const rejectPaths: string[] = [];
  if (testType === "left" && zLeft !== null) {
    rejectPaths.push(buildRejectPath(X_MIN, zLeft));
  } else if (testType === "right" && zRight !== null) {
    rejectPaths.push(buildRejectPath(zRight, X_MAX));
  } else if (testType === "two" && zLeft !== null && zRight !== null) {
    rejectPaths.push(buildRejectPath(X_MIN, zLeft));
    rejectPaths.push(buildRejectPath(zRight, X_MAX));
  }

  // z 统计量在 SVG 上的 x 坐标
  const zSvgX = xToSvg(Math.max(X_MIN, Math.min(X_MAX, zStat)));
  const baseY = pdfToY(0, normPDF(0));
  const zSvgYTop = pdfToY(normPDF(zStat), normPDF(0));

  // 临界值 SVG x 坐标
  const zLeftSvgX = zLeft !== null ? xToSvg(Math.max(X_MIN, Math.min(X_MAX, zLeft))) : null;
  const zRightSvgX = zRight !== null ? xToSvg(Math.max(X_MIN, Math.min(X_MAX, zRight))) : null;

  // 生成随机 z 值（在事件处理函数内）
  const randomize = useCallback(() => {
    const r = Math.random() * 6 - 3; // [-3, 3]
    setZStat(parseFloat(r.toFixed(2)));
  }, []);

  // x 轴刻度
  const xTicks = [-3, -2, -1, 0, 1, 2, 3];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">假设检验直觉演示</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          调整显著性水平 α 和检验统计量 z，观察拒绝域变化与决策结果。
        </p>
      </div>

      {/* 检验类型切换 */}
      <div className="flex gap-1.5 flex-wrap">
        {(["left", "right", "two"] as TestType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTestType(t)}
            className={
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors " +
              (t === testType
                ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)] shadow-sm"
                : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak)]")
            }
          >
            {TEST_LABELS[t]}
          </button>
        ))}
        <span className="ml-2 self-center text-[11px] text-[var(--ink-soft)]">
          {TEST_NOTES[testType]}
        </span>
      </div>

      {/* 正态分布 SVG 可视化 */}
      <div className="rounded-lg border border-[var(--line)] overflow-hidden bg-[var(--bg-muted)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
          {/* 拒绝域填充 */}
          {rejectPaths.map((d, i) => (
            <path key={i} d={d} fill={ACCENT} fillOpacity={0.25} />
          ))}

          {/* p 值区域高亮（淡紫，用于直觉理解） */}
          {testType === "left" && (
            <path
              d={buildRejectPath(X_MIN, Math.max(X_MIN, Math.min(X_MAX, zStat)))}
              fill={zInRejectRegion ? RED : "var(--ink-faint)"}
              fillOpacity={0.12}
            />
          )}
          {testType === "right" && (
            <path
              d={buildRejectPath(Math.max(X_MIN, Math.min(X_MAX, zStat)), X_MAX)}
              fill={zInRejectRegion ? RED : "var(--ink-faint)"}
              fillOpacity={0.12}
            />
          )}
          {testType === "two" && (
            <>
              <path
                d={buildRejectPath(
                  X_MIN,
                  Math.max(X_MIN, Math.min(X_MAX, Math.min(zStat, -Math.abs(zStat))))
                )}
                fill={zInRejectRegion ? RED : "var(--ink-faint)"}
                fillOpacity={0.12}
              />
              <path
                d={buildRejectPath(
                  Math.max(X_MIN, Math.min(X_MAX, Math.abs(zStat))),
                  X_MAX
                )}
                fill={zInRejectRegion ? RED : "var(--ink-faint)"}
                fillOpacity={0.12}
              />
            </>
          )}

          {/* 正态曲线 */}
          <path d={curvePath} fill="none" stroke={ACCENT} strokeWidth="2" />

          {/* x 轴 */}
          <line
            x1={xToSvg(X_MIN)}
            y1={baseY}
            x2={xToSvg(X_MAX)}
            y2={baseY}
            stroke={GRAY_LINE}
            strokeWidth="1"
          />

          {/* x 轴刻度 */}
          {xTicks.map((v) => (
            <g key={v}>
              <line
                x1={xToSvg(v)}
                y1={baseY}
                x2={xToSvg(v)}
                y2={baseY + 4}
                stroke={GRAY_LINE}
                strokeWidth="1"
              />
              <text
                x={xToSvg(v)}
                y={baseY + 14}
                fontSize="10"
                textAnchor="middle"
                fill={GRAY_TEXT}
              >
                {v}
              </text>
            </g>
          ))}

          {/* 临界值竖线（左） */}
          {zLeftSvgX !== null && zLeft !== null && (
            <g>
              <line
                x1={zLeftSvgX}
                y1={PT}
                x2={zLeftSvgX}
                y2={baseY}
                stroke={ACCENT}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={zLeftSvgX}
                y={PT - 6}
                fontSize="9"
                textAnchor="middle"
                fill={ACCENT}
                fontWeight="600"
              >
                z={fmt2(zLeft)}
              </text>
            </g>
          )}

          {/* 临界值竖线（右） */}
          {zRightSvgX !== null && zRight !== null && (
            <g>
              <line
                x1={zRightSvgX}
                y1={PT}
                x2={zRightSvgX}
                y2={baseY}
                stroke={ACCENT}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={zRightSvgX}
                y={PT - 6}
                fontSize="9"
                textAnchor="middle"
                fill={ACCENT}
                fontWeight="600"
              >
                z={fmt2(zRight)}
              </text>
            </g>
          )}

          {/* 检验统计量位置线 */}
          <line
            x1={zSvgX}
            y1={zSvgYTop - 2}
            x2={zSvgX}
            y2={baseY}
            stroke={zInRejectRegion ? RED : GREEN}
            strokeWidth="2"
            strokeDasharray="3 2"
          />

          {/* 倒三角标注 */}
          <polygon
            points={`${zSvgX},${zSvgYTop - 14} ${zSvgX - 6},${zSvgYTop - 24} ${zSvgX + 6},${zSvgYTop - 24}`}
            fill={zInRejectRegion ? RED : GREEN}
          />
          <text
            x={zSvgX}
            y={zSvgYTop - 26}
            fontSize="10"
            textAnchor="middle"
            fill={zInRejectRegion ? RED : GREEN}
            fontWeight="700"
          >
            z={fmt2(zStat)}
          </text>

          {/* 图例：拒绝域标注 */}
          <rect x={PL} y={PT + 2} width={10} height={8} fill={ACCENT} fillOpacity={0.35} rx="1" />
          <text x={PL + 13} y={PT + 9} fontSize="9" fill={GRAY_TEXT}>
            拒绝域 α={fmt4(alpha)}
          </text>
        </svg>
      </div>

      {/* 双滑块控制 */}
      <div className="space-y-3 rounded-lg bg-[var(--bg-muted)] px-4 py-3">
        {/* 显著性水平 α */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              显著性水平 α
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
              style={{ background: ACCENT_LIGHT, color: ACCENT }}
            >
              {alpha.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ink-soft)]">
            α 越大，拒绝域越宽，越容易拒绝 H₀（但犯第一类错误概率越高）
          </p>
          <input
            type="range"
            min={0.01}
            max={0.10}
            step={0.01}
            value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
            className="w-full h-1.5 cursor-pointer"
            style={{ accentColor: ACCENT }}
          />
          <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
            <span>0.01（严格）</span>
            <span>0.10（宽松）</span>
          </div>
        </div>

        {/* 检验统计量 z */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              检验统计量 z
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
              style={{
                background: zInRejectRegion ? RED_LIGHT : GREEN_LIGHT,
                color: zInRejectRegion ? RED : GREEN,
              }}
            >
              {fmt2(zStat)}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ink-soft)]">
            样本数据折合成的标准化统计量（在 H₀ 下服从标准正态分布）
          </p>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.05}
            value={zStat}
            onChange={(e) => setZStat(Number(e.target.value))}
            className="w-full h-1.5 cursor-pointer"
            style={{ accentColor: zInRejectRegion ? RED : GREEN }}
          />
          <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
            <span>−3</span>
            <span>0</span>
            <span>+3</span>
          </div>
        </div>
      </div>

      {/* 决策结果 */}
      <div
        className="rounded-lg border-2 p-4 space-y-2 transition-all duration-300"
        style={{
          borderColor: rejected ? RED : GREEN,
          background: rejected ? RED_LIGHT : GREEN_LIGHT,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[15px] font-bold" style={{ color: rejected ? RED : GREEN }}>
            {rejected ? "拒绝 H₀（p < α）" : "不拒绝 H₀（p ≥ α）"}
          </div>
          <div
            className="rounded-full px-3 py-0.5 text-[12px] font-semibold"
            style={{
              background: rejected ? RED : GREEN,
              color: "white",
            }}
          >
            {rejected ? "差异显著" : "差异不显著"}
          </div>
        </div>

        <div className="text-[12px] leading-relaxed" style={{ color: rejected ? "#991b1b" : "#166534" }}>
          {rejected
            ? `检验统计量 z = ${fmt2(zStat)} 落入拒绝域，说明在显著性水平 α = ${alpha.toFixed(2)} 下，有充分理由拒绝原假设 H₀。`
            : `检验统计量 z = ${fmt2(zStat)} 未落入拒绝域，在显著性水平 α = ${alpha.toFixed(2)} 下，无充分理由拒绝原假设 H₀。`}
        </div>
      </div>

      {/* p 值与关键数据 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "p 值",
            val: fmt4(pValue),
            sub: "P(观测 ≥ |z| | H₀成立)",
            bg: pValue < alpha ? RED_LIGHT : GREEN_LIGHT,
            col: pValue < alpha ? RED : GREEN,
          },
          {
            label: "显著性水平 α",
            val: alpha.toFixed(2),
            sub: "第一类错误上限",
            bg: ACCENT_LIGHT,
            col: ACCENT,
          },
          {
            label: "临界值 z_c",
            val:
              testType === "two" && zLeft !== null && zRight !== null
                ? `±${fmt2(zRight)}`
                : testType === "left" && zLeft !== null
                ? fmt2(zLeft)
                : zRight !== null
                ? fmt2(zRight)
                : "—",
            sub:
              testType === "two"
                ? `双尾 α/2 = ${(alpha / 2).toFixed(3)}`
                : `单尾 α = ${alpha.toFixed(2)}`,
            bg: "var(--bg-muted)",
            col: ACCENT,
          },
        ].map(({ label, val, sub, bg, col }) => (
          <div
            key={label}
            className="rounded-lg p-2.5 text-center"
            style={{ background: bg }}
          >
            <div className="text-[10px] text-[var(--ink-soft)] leading-snug">{label}</div>
            <div
              className="text-[17px] font-extrabold font-mono mt-0.5"
              style={{ color: col }}
            >
              {val}
            </div>
            <div className="text-[9px] text-[var(--ink-soft)] mt-0.5 leading-snug">{sub}</div>
          </div>
        ))}
      </div>

      {/* 公式展示区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 text-[12px] leading-loose text-[var(--ink-soft)] space-y-1.5">
        <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">判决逻辑</div>
        <div className="font-mono">
          p 值 = P(Z {testType === "left" ? "≤" : testType === "right" ? "≥" : "满足 |Z| ≥"} {fmt2(Math.abs(zStat))} | H₀) ={" "}
          <span style={{ color: pValue < alpha ? RED : GREEN, fontWeight: 700 }}>
            {fmt4(pValue)}
          </span>
        </div>
        <div className="font-mono">
          α = <span style={{ color: ACCENT, fontWeight: 700 }}>{alpha.toFixed(2)}</span>
          {"  →  "}
          {pValue < alpha ? (
            <span style={{ color: RED, fontWeight: 700 }}>p &lt; α，拒绝 H₀</span>
          ) : (
            <span style={{ color: GREEN, fontWeight: 700 }}>p ≥ α，不拒绝 H₀</span>
          )}
        </div>
        <div className="text-[11px] mt-1">
          <span className="font-semibold text-[var(--ink)]">直觉：</span>
          p 值是「如果 H₀ 为真，得到至少这么极端结果的概率」。
          p 值越小，说明观测到的数据在 H₀ 下越罕见，越有理由怀疑 H₀。
        </div>
      </div>

      {/* 随机生成按钮 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={randomize}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          随机生成 z 值
        </button>
        <button
          onClick={() => { setAlpha(0.05); setZStat(1.8); setTestType("two"); }}
          className="rounded-lg bg-[var(--bg-muted)] px-4 py-1.5 text-[13px] font-medium text-[var(--ink-soft)] hover:bg-[var(--line)] transition-colors"
        >
          重置默认
        </button>
        <span className="self-center text-[11px] text-[var(--ink-soft)]">
          {testType === "two"
            ? `两侧临界值 ±${zRight !== null ? fmt2(zRight) : "—"}`
            : testType === "left"
            ? `左侧临界值 ${zLeft !== null ? fmt2(zLeft) : "—"}`
            : `右侧临界值 ${zRight !== null ? fmt2(zRight) : "—"}`}
          ，z = {fmt2(zStat)}
          {zInRejectRegion ? "（在拒绝域内）" : "（在接受域内）"}
        </span>
      </div>
    </div>
  );
}

export default memo(HypTestDemoBase);