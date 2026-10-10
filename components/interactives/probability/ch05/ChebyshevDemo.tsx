"use client";

import { memo, useState, useCallback } from "react";
import { tailProbability, chebyshevBound, normPdf } from "@/lib/learning/probability/limits/chebyshev";
import { buildCurvePath, buildTailAreaPath, toSvgX, toSvgY, X_MAX, X_MIN } from "./ChebyshevDemo/geometry";
import { SVG_W, PAD_R, ACCENT, TAIL_COLOR, SVG_H, PAD_L, PAD_T, PLOT_W, PLOT_H, BOUND_COLOR, BOUND_LIGHT, MID_COLOR, MID_LIGHT, ACCENT_LIGHT } from "./ChebyshevDemo/appearance";
import { SliderRow, MetricRow } from "./ChebyshevDemo/controls";
import { fmtPct } from "./ChebyshevDemo/formatters";
// ─── 主组件 ──────────────────────────────────────────────────
function ChebyshevDemoBase() {
  const [sigma, setSigma] = useState<number>(1.0);
  const [eps, setEps]     = useState<number>(2.0);

  // 实时计算
  const realProb  = tailProbability(eps, sigma);
  const bound     = chebyshevBound(eps, sigma);
  const ratio     = realProb > 0 ? bound / realProb : bound > 0 ? Infinity : 1;

  // SVG 曲线所需的 yMax（决定纵轴比例）
  const yMax = Math.max(normPdf(0, sigma) * 1.15, 0.02);

  // 用 useCallback 避免不必要重渲染
  const handleSigma = useCallback((v: number) => setSigma(v), []);
  const handleEps   = useCallback((v: number) => setEps(v), []);

  // 路径
  const curvePath   = buildCurvePath(sigma, yMax);
  const tailPath    = buildTailAreaPath(sigma, eps, yMax);

  // epsilon 在 SVG 上的 x 坐标（正负各一条竖线）
  const epsPosX = toSvgX(eps);
  const epsNegX = toSvgX(-eps);
  const baselineY = toSvgY(0, yMax);
  const peakY     = toSvgY(normPdf(0, sigma), yMax);

  // ε 标注位置（避免超出右边界）
  const epsLabelX = Math.min(epsPosX + 2, SVG_W - PAD_R - 10);

  // X 轴刻度
  const xTicks = [-4, -2, 0, 2, 4];
  // Y 轴最大刻度
  const yTickVal = parseFloat((yMax * 0.8).toFixed(1));

  // 不等式是否有意义（bound 不超过 1 才体现约束力）
  const boundIsOne = bound >= 1;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">切比雪夫不等式演示</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          调整 ε 和 σ，实时对比正态分布的真实尾部概率与切比雪夫上界，感受不等式的松紧程度。
          μ = 0 固定，X ∼ N(0, σ²)。
        </p>
      </div>

      {/* 两个滑块 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
        <SliderRow
          label="标准差 σ"
          sub="控制分布宽窄"
          value={sigma}
          min={0.5}
          max={3}
          step={0.05}
          display={sigma.toFixed(2)}
          color={ACCENT}
          onChange={handleSigma}
        />
        <SliderRow
          label="偏差阈值 ε"
          sub="P(|X| ≥ ε) 的临界距离"
          value={eps}
          min={0.1}
          max={5}
          step={0.05}
          display={eps.toFixed(2)}
          color={TAIL_COLOR}
          onChange={handleEps}
        />
      </div>

      {/* SVG 可视化 */}
      <div className="rounded-lg border border-[var(--line)] overflow-hidden">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 220 }}>
          {/* 背景 */}
          <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" />

          {/* 尾部面积（橙色填充） */}
          <path d={tailPath} fill={TAIL_COLOR} fillOpacity={0.28} />

          {/* 正态曲线 */}
          <path d={curvePath} fill="none" stroke={ACCENT} strokeWidth="2" />

          {/* ε 竖线（右）*/}
          {eps < X_MAX && (
            <>
              <line
                x1={epsPosX} y1={PAD_T}
                x2={epsPosX} y2={baselineY}
                stroke={TAIL_COLOR} strokeWidth="1.5" strokeDasharray="4 3"
              />
              <text
                x={epsLabelX} y={PAD_T + 10}
                fontSize="10" fill={TAIL_COLOR} fontWeight="600"
              >
                +ε
              </text>
            </>
          )}

          {/* -ε 竖线（左）*/}
          {-eps > X_MIN && (
            <>
              <line
                x1={epsNegX} y1={PAD_T}
                x2={epsNegX} y2={baselineY}
                stroke={TAIL_COLOR} strokeWidth="1.5" strokeDasharray="4 3"
              />
              <text
                x={Math.max(epsNegX - 14, PAD_L)} y={PAD_T + 10}
                fontSize="10" fill={TAIL_COLOR} fontWeight="600"
              >
                −ε
              </text>
            </>
          )}

          {/* μ=0 中心虚线 */}
          <line
            x1={toSvgX(0)} y1={peakY}
            x2={toSvgX(0)} y2={baselineY}
            stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="3 3"
          />
          <text x={toSvgX(0) - 2} y={PAD_T + 10} fontSize="9" fill="var(--ink-faint)" textAnchor="middle">
            μ=0
          </text>

          {/* X 轴 */}
          <line x1={PAD_L} y1={baselineY} x2={SVG_W - PAD_R} y2={baselineY} stroke="var(--line)" strokeWidth="1" />
          {xTicks.map((t) => {
            const tx = toSvgX(t);
            if (tx < PAD_L || tx > SVG_W - PAD_R) return null;
            return (
              <g key={t}>
                <line x1={tx} y1={baselineY} x2={tx} y2={baselineY + 4} stroke="var(--ink-faint)" strokeWidth="1" />
                <text x={tx} y={baselineY + 13} fontSize="9" textAnchor="middle" fill="var(--ink-faint)">{t}</text>
              </g>
            );
          })}

          {/* Y 轴 */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={baselineY} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD_L - 4} y={PAD_T + 4} fontSize="9" textAnchor="end" fill="var(--ink-faint)">
            {yTickVal}
          </text>
          <text x={PAD_L - 4} y={baselineY} fontSize="9" textAnchor="end" fill="var(--ink-faint)">0</text>

          {/* 图例 */}
          <rect x={SVG_W - PAD_R - 110} y={PAD_T + 2} width="10" height="10" fill={TAIL_COLOR} fillOpacity={0.55} rx="2" />
          <text x={SVG_W - PAD_R - 97} y={PAD_T + 10} fontSize="9" fill={TAIL_COLOR}>P(|X| ≥ ε)区域</text>

          <rect x={SVG_W - PAD_R - 110} y={PAD_T + 15} width="10" height="3" fill={ACCENT} rx="1" />
          <text x={SVG_W - PAD_R - 97} y={PAD_T + 24} fontSize="9" fill={ACCENT}>N(0, σ²) 曲线</text>
        </svg>
      </div>

      {/* 三行核心数值对比 */}
      <div className="space-y-2">
        <div className="text-[12px] font-semibold text-[var(--ink-soft)] px-1 mb-1">数值对比</div>

        <MetricRow
          label="真实尾部概率"
          formula={`P(|X| ≥ ${eps.toFixed(2)}) = 2·Φ(−${eps.toFixed(2)}/${sigma.toFixed(2)})`}
          value={fmtPct(realProb)}
          color={TAIL_COLOR}
          bg="#fff7ed"
        />

        <MetricRow
          label="切比雪夫上界"
          formula={`σ²/ε² = ${sigma.toFixed(2)}²/${eps.toFixed(2)}² = ${(sigma * sigma).toFixed(3)}/${(eps * eps).toFixed(3)}`}
          value={boundIsOne ? "1（无约束）" : fmtPct(bound)}
          color={BOUND_COLOR}
          bg={BOUND_LIGHT}
        />

        <MetricRow
          label="松紧比（上界 / 真实）"
          formula="= 切比雪夫上界 ÷ P(|X| ≥ ε)"
          value={
            !isFinite(ratio)
              ? "∞（上界=1，无约束）"
              : boundIsOne
              ? "∞（上界=1）"
              : ratio.toFixed(2) + " 倍"
          }
          color={
            !isFinite(ratio) || boundIsOne
              ? BOUND_COLOR
              : ratio >= 10
              ? BOUND_COLOR
              : ratio >= 3
              ? "#ea580c"
              : ratio >= 1.5
              ? "#ca8a04"
              : MID_COLOR
          }
          bg={
            !isFinite(ratio) || boundIsOne
              ? BOUND_LIGHT
              : ratio >= 10
              ? BOUND_LIGHT
              : ratio >= 3
              ? "#fff7ed"
              : ratio >= 1.5
              ? "#fefce8"
              : MID_LIGHT
          }
          isRatio
          ratio={isFinite(ratio) && !boundIsOne ? ratio : 999}
        />
      </div>

      {/* 洞察面板 */}
      <div
        className="rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed"
        style={{
          borderColor: boundIsOne ? "#fca5a5" : ACCENT + "55",
          background: boundIsOne ? "#fff5f5" : ACCENT_LIGHT + "99",
        }}
      >
        {boundIsOne ? (
          <>
            <span className="font-bold" style={{ color: BOUND_COLOR }}>上界 = 1（无意义）：</span>
            <span className="text-[var(--ink-soft)]">
              {" "}当 ε ≤ σ 时，σ²/ε² ≥ 1，而概率本身 ≤ 1，所以切比雪夫上界退化为平凡约束{'"≤ 1"'}。
              尝试增大 ε（或减小 σ），让 ε 超过 σ，使不等式产生真正的约束力。
            </span>
          </>
        ) : (
          <>
            <span className="font-bold" style={{ color: ACCENT }}>直觉：</span>
            <span className="text-[var(--ink-soft)]">
              {" "}切比雪夫不等式对<b>任意分布</b>成立，无需知道具体形态，因此上界很宽松。
              对正态分布而言，实际尾概率以指数速度衰减，比 1/ε² 快得多。
              当前上界是真实概率的{" "}
              <b style={{ color: BOUND_COLOR }}>{isFinite(ratio) ? ratio.toFixed(1) : "∞"} 倍</b>
              ——这就是{'"松紧程度"'}。
              {isFinite(ratio) && ratio < 2 && (
                <span style={{ color: MID_COLOR }}>
                  {" "}此时 ε/σ ≈ {(eps / sigma).toFixed(1)}，比值接近 1，不等式相对较紧。
                </span>
              )}
            </span>
          </>
        )}
      </div>

      {/* 公式卡片 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 text-[12px] text-[var(--ink-soft)] space-y-1.5">
        <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">切比雪夫不等式</div>
        <div className="font-mono">P(|X − μ| ≥ ε) ≤ Var(X) / ε²</div>
        <div className="font-mono">
          {"    "}= σ² / ε²
          {" = "}
          <span style={{ color: ACCENT }}>{sigma.toFixed(2)}</span>²
          {" / "}
          <span style={{ color: TAIL_COLOR }}>{eps.toFixed(2)}</span>²
          {" = "}
          <span className="font-bold" style={{ color: BOUND_COLOR }}>
            {boundIsOne ? "1.0000（上截断）" : bound.toFixed(4)}
          </span>
        </div>
        <p className="text-[11px] pt-1 leading-relaxed">
          不等式对任意（方差有限的）分布均成立，不依赖分布形态。
          正态分布因其指数衰减尾部，真实概率远小于上界。
          <b className="text-[var(--ink)]"> ε 越大（相对于 σ），不等式越宽松。</b>
        </p>
      </div>

      {/* 快捷预设按钮 */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-[var(--ink-soft)]">快捷探索</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "1σ 范围", sigma: 1.0, eps: 1.0 },
            { label: "2σ 范围", sigma: 1.0, eps: 2.0 },
            { label: "3σ 范围", sigma: 1.0, eps: 3.0 },
            { label: "上界≈真实", sigma: 1.0, eps: 0.5 },
            { label: "宽分布", sigma: 2.5, eps: 2.0 },
          ].map(({ label, sigma: s, eps: e }) => (
            <button
              key={label}
              onClick={() => { setSigma(s); setEps(e); }}
              className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--accent)] hover:text-[var(--md-sys-color-on-primary)] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(ChebyshevDemoBase);