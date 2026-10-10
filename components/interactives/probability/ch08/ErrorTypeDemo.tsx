"use client";

import { normalDensity as normPDF } from '@/lib/learning/probability/math/normal';
import { memo, useState, useCallback } from "react";
import { normQuantile, gaussCDF } from "@/lib/learning/probability/testing/errors";
import { makeCurvePath, makeFillPath, X_MAX, X_MIN, toSvgX, toSvgY } from "./ErrorTypeDemo/geometry";
import { SVG_W, SVG_H, C_ALPHA, C_BETA, C_POWER, C_H0, C_H1, PAD_T, C_CRIT, PAD_L, PAD_R, PLOT_H, C_ALPHA_FILL, C_BETA_FILL, C_POWER_FILL, ACCENT } from "./ErrorTypeDemo/appearance";
import { SliderRow, StatCard } from "./ErrorTypeDemo/controls";
// ─── 主组件 ──────────────────────────────────────────────────────────────────
function ErrorTypeDemoBase() {
  const [alpha, setAlpha] = useState(0.05);
  const [delta, setDelta] = useState(1.5);   // 效应量 δ = μ1 - μ0
  const [n, setN] = useState(20);
  const [showDouble, setShowDouble] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<"alpha" | "beta" | "power" | null>(null);

  // ─── 计算核心统计量 ─────────────────────────────────────────────────────────
  // H0: X̄ ~ N(0, 1/√n)；H1: X̄ ~ N(δ, 1/√n)
  // 标准化：假设总体 σ=1，故 X̄ 标准差 = 1/√n
  const sigmaXbar = useCallback((sampleN: number) => 1 / Math.sqrt(sampleN), []);

  const sigma0 = sigmaXbar(n);
  const sigma1 = sigma0;  // H0 和 H1 方差相同（已知 σ）
  const mu0 = 0;
  const mu1 = delta;

  // 单侧检验（右尾），临界值 z_alpha 对应的 x̄ 临界值
  const z_alpha = normQuantile(1 - alpha);
  const critValue = mu0 + z_alpha * sigma0;

  // 第二类错误 β = P(X̄ < critValue | H1)
  const betaValue = gaussCDF(critValue, mu1, sigma1);
  const power = 1 - betaValue;

  // 对比：n 翻倍
  const sigma0_2n = sigmaXbar(n * 2);
  const sigma1_2n = sigma0_2n;
  const critValue_2n = mu0 + z_alpha * sigma0_2n;
  const beta_2n = gaussCDF(critValue_2n, mu1, sigma1_2n);
  const power_2n = 1 - beta_2n;

  // ─── 用于 SVG 绘制的 σ（选择绘制时的坐标 sigma）
  const sigDraw = showDouble ? sigma0_2n : sigma0;
  const maxY = normPDF(mu0, mu0, sigDraw) * 1.08;
  const critDraw = showDouble ? critValue_2n : critValue;

  // ─── 路径 ──────────────────────────────────────────────────────────────────
  const pathH0 = makeCurvePath(mu0, sigDraw, maxY);
  const pathH1 = makeCurvePath(mu1, sigDraw, maxY);

  // α 区域：H0 右尾 [critDraw, +∞)
  const fillAlpha = makeFillPath(mu0, sigDraw, maxY, critDraw, X_MAX);
  // β 区域：H1 左尾 (-∞, critDraw]
  const fillBeta = makeFillPath(mu1, sigDraw, maxY, X_MIN, critDraw);
  // 功效区域：H1 右尾 [critDraw, +∞)
  const fillPower = makeFillPath(mu1, sigDraw, maxY, critDraw, X_MAX);

  const critSvgX = toSvgX(critDraw);
  const baseY = toSvgY(0, maxY);

  // x 轴刻度
  const xTicks: number[] = [];
  for (let v = Math.ceil(X_MIN); v <= Math.floor(X_MAX); v++) {
    if (v !== 0) xTicks.push(v);
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">两类错误权衡可视化</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          调整显著性水平 α、效应量 δ 或样本量 n，观察第一类错误（α）与第二类错误（β）的此消彼长。
        </p>
      </div>

      {/* SVG 主图 */}
      <div className="relative select-none">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-muted)]"
          style={{ maxHeight: 220 }}
        >
          {/* ── 填充区域 ── */}
          {/* α：H0 右尾（红） */}
          {fillAlpha && (
            <path
              d={fillAlpha}
              fill={C_ALPHA}
              opacity={hoveredRegion === "alpha" ? 0.55 : 0.35}
              className="transition-opacity duration-200"
            />
          )}
          {/* β：H1 左尾（橙） */}
          {fillBeta && (
            <path
              d={fillBeta}
              fill={C_BETA}
              opacity={hoveredRegion === "beta" ? 0.55 : 0.35}
              className="transition-opacity duration-200"
            />
          )}
          {/* 功效：H1 右尾（绿） */}
          {fillPower && (
            <path
              d={fillPower}
              fill={C_POWER}
              opacity={hoveredRegion === "power" ? 0.55 : 0.25}
              className="transition-opacity duration-200"
            />
          )}

          {/* ── 曲线 ── */}
          <path d={pathH0} fill="none" stroke={C_H0} strokeWidth="2" />
          <path d={pathH1} fill="none" stroke={C_H1} strokeWidth="2" />

          {/* ── 临界线 ── */}
          <line
            x1={critSvgX.toFixed(2)} y1={PAD_T}
            x2={critSvgX.toFixed(2)} y2={baseY}
            stroke={C_CRIT} strokeWidth="1.5" strokeDasharray="5 3"
          />

          {/* ── μ0 和 μ1 标记 ── */}
          <line
            x1={toSvgX(mu0).toFixed(2)} y1={(baseY - 4).toFixed(2)}
            x2={toSvgX(mu0).toFixed(2)} y2={(baseY + 2).toFixed(2)}
            stroke={C_H0} strokeWidth="1.5"
          />
          <text
            x={toSvgX(mu0).toFixed(2)} y={(baseY + 12).toFixed(2)}
            fontSize="10" textAnchor="middle" fill={C_H0} fontWeight="bold"
          >
            μ₀=0
          </text>

          <line
            x1={toSvgX(mu1).toFixed(2)} y1={(baseY - 4).toFixed(2)}
            x2={toSvgX(mu1).toFixed(2)} y2={(baseY + 2).toFixed(2)}
            stroke={C_H1} strokeWidth="1.5"
          />
          <text
            x={toSvgX(mu1).toFixed(2)} y={(baseY + 12).toFixed(2)}
            fontSize="10" textAnchor="middle" fill={C_H1} fontWeight="bold"
          >
            μ₁={delta.toFixed(1)}
          </text>

          {/* ── 临界值标注 ── */}
          <text
            x={(critSvgX + 3).toFixed(2)} y={(PAD_T + 10).toFixed(2)}
            fontSize="9" fill={C_CRIT} fontWeight="600"
          >
            c={critDraw.toFixed(2)}
          </text>

          {/* ── 曲线标签 ── */}
          <text
            x={toSvgX(mu0 - sigDraw * 1.2).toFixed(2)}
            y={(PAD_T + 14).toFixed(2)}
            fontSize="10" textAnchor="middle" fill={C_H0} fontWeight="bold"
          >
            H₀
          </text>
          <text
            x={toSvgX(mu1 + sigDraw * 1.2).toFixed(2)}
            y={(PAD_T + 14).toFixed(2)}
            fontSize="10" textAnchor="middle" fill={C_H1} fontWeight="bold"
          >
            H₁
          </text>

          {/* ── x 轴 ── */}
          <line
            x1={PAD_L} y1={baseY}
            x2={SVG_W - PAD_R} y2={baseY}
            stroke="var(--line)" strokeWidth="1"
          />
          {xTicks.map((v) => (
            <g key={v}>
              <line
                x1={toSvgX(v)} y1={baseY}
                x2={toSvgX(v)} y2={baseY + 3}
                stroke="var(--line)" strokeWidth="1"
              />
              <text
                x={toSvgX(v)} y={baseY + 12}
                fontSize="8" textAnchor="middle" fill="var(--ink-faint)"
              >
                {v}
              </text>
            </g>
          ))}

          {/* ── α/β 标注文字 ── */}
          {/* α 标注（H0 右尾中心） */}
          {critDraw < X_MAX - 0.5 && (
            <text
              x={toSvgX((critDraw + X_MAX) / 2).toFixed(2)}
              y={(baseY - PLOT_H * 0.12).toFixed(2)}
              fontSize="10" textAnchor="middle" fill={C_ALPHA} fontWeight="bold"
            >
              α
            </text>
          )}
          {/* β 标注（H1 左尾中心） */}
          {critDraw > X_MIN + 0.5 && critDraw < mu1 && (
            <text
              x={toSvgX((X_MIN + critDraw) / 2 + 0.5).toFixed(2)}
              y={(baseY - PLOT_H * 0.08).toFixed(2)}
              fontSize="10" textAnchor="middle" fill={C_BETA} fontWeight="bold"
            >
              β
            </text>
          )}
          {/* 功效标注（H1 右尾中心） */}
          {critDraw < mu1 + sigDraw * 2 && (
            <text
              x={toSvgX(Math.min((critDraw + mu1 + sigDraw * 2) / 2, X_MAX - 0.3)).toFixed(2)}
              y={(baseY - PLOT_H * 0.15).toFixed(2)}
              fontSize="9" textAnchor="middle" fill={C_POWER} fontWeight="bold"
            >
              1-β
            </text>
          )}
        </svg>

        {/* n翻倍标记 */}
        {showDouble && (
          <div className="mt-1 text-center text-[11px] font-semibold" style={{ color: C_POWER }}>
            当前显示：n = {n * 2}（翻倍后），α 保持 {(alpha * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* 图例说明（可点击高亮） */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "alpha" as const, color: C_ALPHA, bg: C_ALPHA_FILL, label: `第一类错误 α（弃真）`, desc: "H₀为真却拒绝 H₀" },
          { key: "beta" as const, color: C_BETA, bg: C_BETA_FILL, label: `第二类错误 β（取伪）`, desc: "H₁为真却接受 H₀" },
          { key: "power" as const, color: C_POWER, bg: C_POWER_FILL, label: `检验功效 1-β`, desc: "正确拒绝 H₀ 的概率" },
        ].map(({ key, color, bg, label, desc }) => (
          <button
            key={key}
            onMouseEnter={() => setHoveredRegion(key)}
            onMouseLeave={() => setHoveredRegion(null)}
            onClick={() => setHoveredRegion(hoveredRegion === key ? null : key)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] border transition-all duration-150"
            style={{
              background: hoveredRegion === key ? bg : "var(--bg-muted)",
              borderColor: hoveredRegion === key ? color : "var(--line)",
              color: hoveredRegion === key ? color : "var(--ink-soft)",
            }}
          >
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span className="font-medium">{label}</span>
            <span className="text-[10px] opacity-70">{desc}</span>
          </button>
        ))}
      </div>

      {/* 滑块控制区 */}
      <div className="space-y-3 rounded-lg bg-[var(--bg-muted)] px-4 py-3">
        <SliderRow
          label="显著性水平 α"
          value={alpha}
          min={0.01}
          max={0.20}
          step={0.005}
          display={(alpha * 100).toFixed(1) + "%"}
          color={C_ALPHA}
          onChange={setAlpha}
          hint="↑ α → 拒绝域扩大，β ↓，但误判 H₀ 的概率增加。"
        />
        <SliderRow
          label="效应量 δ = μ₁ − μ₀"
          value={delta}
          min={0.5}
          max={3.0}
          step={0.1}
          display={delta.toFixed(1)}
          color={C_H1}
          onChange={setDelta}
          hint="两分布距离越远，β 越小，越易区分 H₀ 与 H₁。"
        />
        <SliderRow
          label="样本量 n"
          value={n}
          min={5}
          max={50}
          step={1}
          display={String(n)}
          color={ACCENT}
          onChange={setN}
          hint="↑ n → 两分布变窄，重叠减少，β ↓，功效 ↑。"
        />
      </div>

      {/* 核心数值面板 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="第一类错误 α"
          value={(alpha * 100).toFixed(1) + "%"}
          sub="H₀为真时拒绝"
          color={C_ALPHA}
          bg={C_ALPHA_FILL}
        />
        <StatCard
          label="第二类错误 β"
          value={((showDouble ? beta_2n : betaValue) * 100).toFixed(1) + "%"}
          sub="H₁为真时未拒绝"
          color={C_BETA}
          bg={C_BETA_FILL}
        />
        <StatCard
          label="检验功效 1−β"
          value={((showDouble ? power_2n : power) * 100).toFixed(1) + "%"}
          sub="正确拒绝 H₀"
          color={C_POWER}
          bg={C_POWER_FILL}
        />
        <StatCard
          label="临界值 c"
          value={(showDouble ? critValue_2n : critValue).toFixed(3)}
          sub={`z_α = ${normQuantile(1 - alpha).toFixed(3)}`}
          color={C_CRIT}
          bg="var(--bg-muted)"
        />
      </div>

      {/* n 翻倍对比区 */}
      <div className="rounded-lg border border-[var(--line)] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-[var(--ink)]">
            若 n 翻倍（n = {n} → {n * 2}），α 不变时 β 如何变化？
          </span>
          <button
            onClick={() => setShowDouble((v) => !v)}
            className="rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors"
            style={{
              background: showDouble ? C_POWER : "var(--bg-muted)",
              color: showDouble ? "white" : "var(--ink-soft)",
            }}
          >
            {showDouble ? "恢复原始 n" : "展示 n×2"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {[
            { label: "α（保持不变）", before: (alpha * 100).toFixed(1) + "%", after: (alpha * 100).toFixed(1) + "%", changed: false },
            { label: "β（第二类错误）", before: (betaValue * 100).toFixed(1) + "%", after: (beta_2n * 100).toFixed(1) + "%", changed: true },
            { label: "功效 1−β", before: (power * 100).toFixed(1) + "%", after: (power_2n * 100).toFixed(1) + "%", changed: true },
          ].map(({ label, before, after, changed }) => (
            <div key={label} className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-2">
              <div className="font-medium text-[var(--ink-soft)] mb-1">{label}</div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-[var(--ink)]">{before}</span>
                <span className="text-[var(--ink-soft)]">→</span>
                <span
                  className="font-mono font-bold"
                  style={{ color: changed ? (label.includes("β") ? C_BETA : C_POWER) : "var(--ink-soft)" }}
                >
                  {after}
                </span>
              </div>
              {changed && (
                <div
                  className="mt-0.5 text-[10px] font-medium"
                  style={{ color: label.includes("β") ? C_BETA : C_POWER }}
                >
                  {label.includes("β") ? "↓ 减小" : "↑ 提升"}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 直觉洞察 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-bold text-[var(--ink)]">核心直觉：</span>
        α 与 β 是一对{'"此消彼长"'}的矛盾——
        在<b className="text-[var(--ink)]">固定 n 和 δ</b> 时，缩小 α（拒绝域变窄）必然让 β 增大；扩大 α 则 β 减小。
        唯有<b className="text-[var(--ink)]">增大 n</b>（样本量）或<b className="text-[var(--ink)]">增大 δ</b>（效应量）才能在
        保持 α 的同时降低 β，提升检验功效。
        这正是{'"检验功效分析"'}在实验设计中的核心价值。
      </div>
    </div>
  );
}

export default memo(ErrorTypeDemoBase);