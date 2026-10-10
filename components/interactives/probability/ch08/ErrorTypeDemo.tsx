"use client";

import { normalDensity as normPDF } from '@/lib/learning/probability/math/normal';

import { memo, useState, useCallback } from "react";

// ─── 颜色常量 ────────────────────────────────────────────────────────────────
const C_ALPHA = "#dc2626";       // 红：α（第一类错误）
const C_ALPHA_FILL = "#fee2e2";
const C_BETA = "#ea580c";        // 橙：β（第二类错误）
const C_BETA_FILL = "#ffedd5";
const C_POWER = "#0f766e";       // 绿：功效 1-β
const C_POWER_FILL = "#ccfbf1";
const C_H0 = "#5b46e5";          // 主色：H0 曲线
const C_H1 = "#0ea5e9";          // 蓝：H1 曲线
const C_CRIT = "var(--ink-soft)";        // 灰：临界线
const ACCENT = "#5b46e5";

// ─── SVG 布局 ────────────────────────────────────────────────────────────────
const SVG_W = 560;
const SVG_H = 200;
const PAD_L = 10;
const PAD_R = 10;
const PAD_T = 18;
const PAD_B = 40;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

/** 标准正态 CDF（Abramowitz & Stegun 近似，误差 < 1.5e-7） */
function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const p = 1 - normPDF(x, 0, 1) * poly;
  return x >= 0 ? p : 1 - p;
}

/** 正态分布 CDF（任意 mu/sigma） */
function gaussCDF(x: number, mu: number, sigma: number): number {
  return normCDF((x - mu) / sigma);
}

/** 正态分布逆 CDF 近似（Beasley-Springer-Moro）*/
function normQuantile(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
    0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
    0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const q = p - 0.5;
  if (Math.abs(q) < 0.42) {
    const r = q * q;
    return q * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) /
      ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
  }
  const r = q < 0 ? Math.log(-Math.log(p)) : Math.log(-Math.log(1 - p));
  let val = c[0];
  for (let i = 1; i < 9; i++) val += c[i] * Math.pow(r, i);
  return q < 0 ? -val : val;
}

// ─── 坐标映射 ────────────────────────────────────────────────────────────────
const X_MIN = -4;
const X_MAX = 7;

function toSvgX(v: number): number {
  return PAD_L + ((v - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
}

function toSvgY(v: number, maxY: number): number {
  return PAD_T + PLOT_H - (v / maxY) * PLOT_H;
}

// ─── 生成 SVG 路径 ────────────────────────────────────────────────────────────
function makeCurvePath(mu: number, sigma: number, maxY: number, steps = 300): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
    const y = normPDF(x, mu, sigma);
    const sx = toSvgX(x);
    const sy = toSvgY(y, maxY);
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

/** 生成曲线在 [xLo, xHi] 范围内的填充路径（梯形封底） */
function makeFillPath(mu: number, sigma: number, maxY: number, xLo: number, xHi: number, steps = 100): string {
  const pts: string[] = [];
  const lo = Math.max(xLo, X_MIN);
  const hi = Math.min(xHi, X_MAX);
  if (lo >= hi) return "";
  for (let i = 0; i <= steps; i++) {
    const x = lo + (i / steps) * (hi - lo);
    const y = normPDF(x, mu, sigma);
    const sx = toSvgX(x).toFixed(2);
    const sy = toSvgY(y, maxY).toFixed(2);
    pts.push(`${i === 0 ? "M" : "L"}${sx},${sy}`);
  }
  const baseY = toSvgY(0, maxY).toFixed(2);
  pts.push(`L${toSvgX(hi).toFixed(2)},${baseY}`);
  pts.push(`L${toSvgX(lo).toFixed(2)},${baseY}`);
  pts.push("Z");
  return pts.join(" ");
}

// ─── 滑块子组件 ──────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  color: string;
  onChange: (v: number) => void;
  hint?: string;
}

function SliderRow({ label, value, min, max, step, display, color, onChange, hint }: SliderRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded px-2 py-0.5 text-[12px] font-mono font-bold"
          style={{ background: color + "22", color }}
        >
          {display}
        </span>
      </div>
      {hint && <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">{hint}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 cursor-pointer"
        style={{ accentColor: color }}
      />
    </div>
  );
}

// ─── 统计数值卡片 ─────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}

function StatCard({ label, value, sub, color, bg }: StatCardProps) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: bg }}>
      <div className="text-[10px] leading-snug text-[var(--ink-soft)]">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--ink-soft)]">{sub}</div>}
    </div>
  );
}

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
