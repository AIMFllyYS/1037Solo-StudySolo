"use client";

import { memo, useState, useCallback } from "react";
import { normalPDF } from "@/lib/learning/probability/moments/variance";
import { yToSvg, buildCurvePath, buildFillPath, xToSvg, X_MIN, X_MAX } from "./VarianceExplorer/geometry";
import { SVG_W, SVG_H, PAD_L, PAD_T, PLOT_W, PLOT_H, GRAY, BLUE, ORANGE, ORANGE_MID, BLUE_MID, BLUE_LIGHT, ORANGE_LIGHT } from "./VarianceExplorer/appearance";
import { SliderRow, StatCard } from "./VarianceExplorer/controls";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function VarianceExplorerBase() {
  // 分布 A（蓝）
  const [muA, setMuA] = useState<number>(0);
  const [sigmaA, setSigmaA] = useState<number>(1);

  // 分布 B（橙）
  const [muB, setMuB] = useState<number>(1.5);
  const [sigmaB, setSigmaB] = useState<number>(1.8);

  // 控制面板
  const [showBand, setShowBand] = useState<1 | 2>(1); // ±1σ 或 ±2σ
  const [showB, setShowB] = useState<boolean>(true);   // 是否显示分布 B

  // 线性变换验算参数
  const [linA, setLinA] = useState<number>(2);   // a
  const [linB, setLinB] = useState<number>(1);   // b（Y = aX + b）

  // ─── 计算派生值 ──────────────────────────────────────────────────────────────
  const varA = sigmaA ** 2;
  const varB = sigmaB ** 2;

  // 线性变换的分布（作用于分布 A）
  const varY = linA ** 2 * varA;
  const sigmaY = Math.abs(linA) * sigmaA;
  const muY = linA * muA + linB;

  // 两分布曲线共用 y 轴最大值（峰值较大的那个，留 5% 余量）
  const peakA = normalPDF(muA, muA, sigmaA);
  const peakB = normalPDF(muB, muB, sigmaB);
  const yMax = Math.max(peakA, showB ? peakB : 0) * 1.12;

  // ─── SVG x 轴刻度 ────────────────────────────────────────────────────────────
  const xTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const baseY = yToSvg(0, yMax);

  // ─── 路径 ────────────────────────────────────────────────────────────────────
  const pathA = buildCurvePath(muA, sigmaA, yMax);
  const pathB = buildCurvePath(muB, sigmaB, yMax);

  const fillA1 = buildFillPath(muA, sigmaA, yMax, 1);
  const fillA2 = buildFillPath(muA, sigmaA, yMax, 2);
  const fillB1 = buildFillPath(muB, sigmaB, yMax, 1);
  const fillB2 = buildFillPath(muB, sigmaB, yMax, 2);

  // ─── μ 竖线位置 ──────────────────────────────────────────────────────────────
  const muAx = xToSvg(muA);
  const muBx = xToSvg(muB);

  // ─── 格式化 ──────────────────────────────────────────────────────────────────
  const fmt = useCallback((v: number, d = 3) => v.toFixed(d), []);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">方差与分布扩散度可视化</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          独立调整两个正态分布的均值 μ 和标准差 σ，观察曲线形状与扩散度的变化。
        </p>
      </div>

      {/* 共用 SVG 图区 */}
      <div className="rounded-lg border border-[var(--line)] overflow-hidden bg-[var(--bg-muted)]">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full">
          {/* 图区背景 */}
          <rect
            x={PAD_L} y={PAD_T}
            width={PLOT_W} height={PLOT_H}
            fill="var(--bg-muted)"
          />

          {/* x 轴网格线 */}
          {xTicks.map((t) => (
            <line
              key={t}
              x1={xToSvg(t)} y1={PAD_T}
              x2={xToSvg(t)} y2={PAD_T + PLOT_H}
              stroke={t === 0 ? "var(--ink-faint)" : GRAY}
              strokeWidth={t === 0 ? 1.2 : 0.8}
              strokeDasharray={t === 0 ? undefined : "3 3"}
            />
          ))}

          {/* ±2σ 填色（先画，在曲线之下）*/}
          {showBand >= 2 && (
            <>
              <path d={fillA2} fill={BLUE} opacity={0.1} />
              {showB && <path d={fillB2} fill={ORANGE} opacity={0.1} />}
            </>
          )}

          {/* ±1σ 填色 */}
          <path d={fillA1} fill={BLUE} opacity={0.18} />
          {showB && <path d={fillB1} fill={ORANGE} opacity={0.18} />}

          {/* μ 竖线（分布 A 蓝） */}
          <line
            x1={muAx} y1={PAD_T}
            x2={muAx} y2={baseY}
            stroke={BLUE} strokeWidth={1.5} strokeDasharray="5 3"
          />

          {/* μ 竖线（分布 B 橙） */}
          {showB && (
            <line
              x1={muBx} y1={PAD_T}
              x2={muBx} y2={baseY}
              stroke={ORANGE} strokeWidth={1.5} strokeDasharray="5 3"
            />
          )}

          {/* 曲线 B（先画，A 在上） */}
          {showB && (
            <path d={pathB} fill="none" stroke={ORANGE_MID} strokeWidth={2.2} />
          )}

          {/* 曲线 A */}
          <path d={pathA} fill="none" stroke={BLUE_MID} strokeWidth={2.5} />

          {/* x 轴 */}
          <line
            x1={PAD_L} y1={baseY}
            x2={PAD_L + PLOT_W} y2={baseY}
            stroke="var(--ink-faint)" strokeWidth={1}
          />

          {/* x 轴刻度与标签 */}
          {xTicks.map((t) => (
            <g key={t}>
              <line
                x1={xToSvg(t)} y1={baseY}
                x2={xToSvg(t)} y2={baseY + 4}
                stroke="var(--ink-faint)" strokeWidth={1}
              />
              <text
                x={xToSvg(t)} y={baseY + 13}
                fontSize="9" textAnchor="middle"
                fill="var(--ink-faint)"
              >
                {t}
              </text>
            </g>
          ))}

          {/* μ 标注：分布 A */}
          <text
            x={muAx + 3} y={PAD_T + 10}
            fontSize="10" fill={BLUE} fontWeight={700}
          >
            μA={fmt(muA, 1)}
          </text>

          {/* μ 标注：分布 B */}
          {showB && (
            <text
              x={muBx + 3}
              y={PAD_T + 22}
              fontSize="10" fill={ORANGE} fontWeight={700}
            >
              μB={fmt(muB, 1)}
            </text>
          )}

          {/* ±1σ 区间标注（分布 A，紧贴 x 轴上方） */}
          {(() => {
            const lo = xToSvg(Math.max(muA - sigmaA, X_MIN));
            const hi = xToSvg(Math.min(muA + sigmaA, X_MAX));
            const y = baseY - 6;
            if (hi - lo < 10) return null;
            return (
              <g>
                <line x1={lo} y1={y} x2={hi} y2={y} stroke={BLUE} strokeWidth={1.5} />
                <line x1={lo} y1={y - 3} x2={lo} y2={y + 3} stroke={BLUE} strokeWidth={1.5} />
                <line x1={hi} y1={y - 3} x2={hi} y2={y + 3} stroke={BLUE} strokeWidth={1.5} />
                <text x={(lo + hi) / 2} y={y - 4} fontSize="8.5" textAnchor="middle" fill={BLUE}>
                  ±1σA
                </text>
              </g>
            );
          })()}

          {/* ±1σ 区间标注（分布 B） */}
          {showB && (() => {
            const lo = xToSvg(Math.max(muB - sigmaB, X_MIN));
            const hi = xToSvg(Math.min(muB + sigmaB, X_MAX));
            const y = baseY - 18;
            if (hi - lo < 10) return null;
            return (
              <g>
                <line x1={lo} y1={y} x2={hi} y2={y} stroke={ORANGE} strokeWidth={1.5} />
                <line x1={lo} y1={y - 3} x2={lo} y2={y + 3} stroke={ORANGE} strokeWidth={1.5} />
                <line x1={hi} y1={y - 3} x2={hi} y2={y + 3} stroke={ORANGE} strokeWidth={1.5} />
                <text x={(lo + hi) / 2} y={y - 4} fontSize="8.5" textAnchor="middle" fill={ORANGE}>
                  ±1σB
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* 控制按钮行 */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowBand(showBand === 1 ? 2 : 1)}
          className={
            "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
            (showBand === 2
              ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
              : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]")
          }
        >
          {showBand === 2 ? "显示 ±2σ" : "显示 ±1σ"} 区间
        </button>
        <button
          onClick={() => setShowB(!showB)}
          className={
            "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
            (showB
              ? "bg-[#ffedd5] text-[#c2410c]"
              : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]")
          }
        >
          {showB ? "隐藏分布 B" : "显示分布 B"}
        </button>
        <span className="ml-auto text-[11px] text-[var(--ink-soft)]">
          阴影面积：±1σ ≈ 68.3%，±2σ ≈ 95.4%
        </span>
      </div>

      {/* 两列滑块 + 数值面板 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 分布 A */}
        <div className="rounded-lg border-2 p-3 space-y-3" style={{ borderColor: BLUE, background: BLUE_LIGHT + "55" }}>
          <div className="text-[13px] font-bold" style={{ color: BLUE }}>分布 A（蓝色）</div>
          <SliderRow
            label="均值 μA"
            value={muA}
            min={-3}
            max={3}
            step={0.1}
            display={fmt(muA, 1)}
            onChange={setMuA}
            color={BLUE}
          />
          <SliderRow
            label="标准差 σA"
            value={sigmaA}
            min={0.3}
            max={3}
            step={0.05}
            display={fmt(sigmaA, 2)}
            onChange={setSigmaA}
            color={BLUE_MID}
          />
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <StatCard label="E[X] = μ" value={fmt(muA, 2)} color={BLUE} bg={BLUE_LIGHT} />
            <StatCard label="D[X] = σ²" value={fmt(varA, 3)} color={BLUE_MID} bg={BLUE_LIGHT} />
            <StatCard label="σ（标准差）" value={fmt(sigmaA, 3)} color="#7c3aed" bg={BLUE_LIGHT} />
          </div>
        </div>

        {/* 分布 B */}
        <div
          className="rounded-lg border-2 p-3 space-y-3 transition-opacity"
          style={{
            borderColor: ORANGE,
            background: ORANGE_LIGHT + "55",
            opacity: showB ? 1 : 0.4,
          }}
        >
          <div className="text-[13px] font-bold" style={{ color: ORANGE }}>分布 B（橙色）</div>
          <SliderRow
            label="均值 μB"
            value={muB}
            min={-3}
            max={3}
            step={0.1}
            display={fmt(muB, 1)}
            onChange={setMuB}
            color={ORANGE}
          />
          <SliderRow
            label="标准差 σB"
            value={sigmaB}
            min={0.3}
            max={3}
            step={0.05}
            display={fmt(sigmaB, 2)}
            onChange={setSigmaB}
            color={ORANGE_MID}
          />
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <StatCard label="E[X] = μ" value={fmt(muB, 2)} color={ORANGE} bg={ORANGE_LIGHT} />
            <StatCard label="D[X] = σ²" value={fmt(varB, 3)} color={ORANGE_MID} bg={ORANGE_LIGHT} />
            <StatCard label="σ（标准差）" value={fmt(sigmaB, 3)} color="#b45309" bg={ORANGE_LIGHT} />
          </div>
        </div>
      </div>

      {/* 分布比较洞察 */}
      {showB && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">对比分析：</span>
          {sigmaA < sigmaB
            ? `分布 A（σ=${fmt(sigmaA, 2)}）比分布 B（σ=${fmt(sigmaB, 2)}）更集中，方差更小（${fmt(varA, 3)} < ${fmt(varB, 3)}），曲线更高更窄。`
            : sigmaA > sigmaB
            ? `分布 A（σ=${fmt(sigmaA, 2)}）比分布 B（σ=${fmt(sigmaB, 2)}）更分散，方差更大（${fmt(varA, 3)} > ${fmt(varB, 3)}），曲线更矮更宽。`
            : `两分布标准差相同（σ=${fmt(sigmaA, 2)}），形状完全一致，仅均值（${fmt(muA, 1)} vs ${fmt(muB, 1)}）不同，曲线只是平移关系。`}
        </div>
      )}

      {/* 线性变换验算 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 space-y-3">
        <div className="text-[13px] font-bold text-[var(--ink)]">
          线性变换性质验算：D(aX + b) = a²·D(X)
        </div>
        <p className="text-[12px] text-[var(--ink-soft)] leading-relaxed">
          对分布 A 做变换 Y = aX + b，调整 a、b 观察方差的变化——
          <b className="text-[var(--ink)]"> b 的平移完全不影响方差</b>，
          只有系数 a 的平方决定方差的缩放比。
        </p>

        {/* a 和 b 的滑块 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[var(--ink)]">系数 a</span>
              <span
                className="rounded px-1.5 py-0.5 text-[12px] font-mono font-bold"
                style={{ background: BLUE_LIGHT, color: BLUE }}
              >
                {fmt(linA, 1)}
              </span>
            </div>
            <input
              type="range"
              min={-3}
              max={3}
              step={0.1}
              value={linA}
              onChange={(e) => setLinA(Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer"
              style={{ accentColor: BLUE }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[var(--ink)]">平移 b</span>
              <span
                className="rounded px-1.5 py-0.5 text-[12px] font-mono font-bold"
                style={{ background: GRAY, color: "var(--ink-soft)" }}
              >
                {fmt(linB, 1)}
              </span>
            </div>
            <input
              type="range"
              min={-4}
              max={4}
              step={0.1}
              value={linB}
              onChange={(e) => setLinB(Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer"
              style={{ accentColor: "#64748b" }}
            />
          </div>
        </div>

        {/* 数值验算展示 */}
        <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--line)] px-3 py-2.5 font-mono text-[12px] leading-loose text-[var(--ink-soft)] space-y-0.5">
          <div>
            <span className="text-[var(--ink)]">X</span>
            {" ~ N("}
            <span style={{ color: BLUE }}>{fmt(muA, 2)}</span>
            {", "}
            <span style={{ color: BLUE_MID }}>{fmt(sigmaA, 3)}</span>
            {")"}，D[X] ={" "}
            <span style={{ color: BLUE_MID, fontWeight: 700 }}>{fmt(varA, 4)}</span>
          </div>
          <div>
            <span className="text-[var(--ink)]">Y = {fmt(linA, 1)}X + {fmt(linB, 1)}</span>
          </div>
          <div>
            E[Y] = a·μ + b = {fmt(linA, 1)}×{fmt(muA, 2)} + {fmt(linB, 1)} ={" "}
            <span style={{ color: ORANGE, fontWeight: 700 }}>{fmt(muY, 4)}</span>
          </div>
          <div>
            D[Y] = a²·D[X] = {fmt(linA, 1)}² × {fmt(varA, 4)} ={" "}
            <span style={{ color: ORANGE_MID, fontWeight: 700 }}>{fmt(varY, 4)}</span>
          </div>
          <div>
            σ[Y] = |a|·σ[X] = |{fmt(linA, 1)}| × {fmt(sigmaA, 4)} ={" "}
            <span style={{ color: "#b45309", fontWeight: 700 }}>{fmt(sigmaY, 4)}</span>
          </div>
        </div>

        {/* 关键洞察 */}
        <div
          className="rounded-lg border-l-4 pl-3 py-1.5 text-[12px] text-[var(--ink-soft)] leading-relaxed"
          style={{ borderColor: BLUE_MID, background: BLUE_LIGHT }}
        >
          <span className="font-semibold text-[var(--ink)]">关键洞察：</span>
          平移 b = {fmt(linB, 1)} 改变了均值，但方差
          <b className="text-[var(--ink)]"> 不变</b>——方差度量的是{'"离散程度"'}，
          整体移动不影响数据之间的相对距离。
          而缩放 a = {fmt(linA, 1)} 让方差变为原来的
          <b style={{ color: BLUE_MID }}> {fmt(linA ** 2, 3)}</b> 倍。
        </div>
      </div>

      {/* 结论摘要卡 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="D[X_A] = σA²" value={fmt(varA, 4)} color={BLUE_MID} bg={BLUE_LIGHT} />
        {showB && (
          <StatCard label="D[X_B] = σB²" value={fmt(varB, 4)} color={ORANGE_MID} bg={ORANGE_LIGHT} />
        )}
        <StatCard label="D[aX+b]" value={fmt(varY, 4)} color={ORANGE} bg={ORANGE_LIGHT} />
        <StatCard label="a²·D[X_A]" value={fmt(linA ** 2 * varA, 4)} color={BLUE} bg={BLUE_LIGHT} />
      </div>
    </div>
  );
}

export default memo(VarianceExplorerBase);