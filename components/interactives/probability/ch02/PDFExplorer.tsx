"use client";

import { normalDensity as normalPDF } from '@/lib/learning/probability/math/normal';

import { memo, useState, useCallback, useRef } from "react";

// ─── 设计常量 ────────────────────────────────────────────────────
const ACCENT = "#5b46e5";
const ACCENT_LIGHT = "var(--accent-weak)";
const TEAL = "#0d9488";
const ORANGE = "#ea580c";
const FILL_COLOR = "#a78bfa";
const FILL_OPACITY = 0.35;

// ─── SVG 画布尺寸 ─────────────────────────────────────────────────
const SVG_W = 520;
const SVG_H = 220;
const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 36;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

// ─── 分布类型 ─────────────────────────────────────────────────────
type DistType = "uniform" | "exponential" | "normal";

// ─── 数学辅助 ─────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function expPDF(x: number, lam: number): number {
  if (x < 0) return 0;
  return lam * Math.exp(-lam * x);
}

function uniformPDF(x: number, a: number, b: number): number {
  if (x < a || x > b) return 0;
  return 1 / (b - a);
}

// 数值积分（梯形法）
function trapezoidProb(
  dist: DistType,
  lo: number,
  hi: number,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): number {
  const N = 500;
  const dx = (hi - lo) / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const x = lo + i * dx;
    let f = 0;
    if (dist === "uniform") f = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") f = expPDF(x, params.lam);
    else f = normalPDF(x, params.mu, params.sigma);
    sum += i === 0 || i === N ? f * 0.5 : f;
  }
  return clamp(sum * dx, 0, 1);
}

// ─── 坐标映射 ─────────────────────────────────────────────────────
interface ViewRange {
  xMin: number;
  xMax: number;
  yMax: number;
}

function toSVGX(x: number, vr: ViewRange): number {
  return PAD_L + ((x - vr.xMin) / (vr.xMax - vr.xMin)) * PLOT_W;
}

function toSVGY(y: number, vr: ViewRange): number {
  return PAD_T + PLOT_H - (y / vr.yMax) * PLOT_H;
}

function fromSVGX(sx: number, vr: ViewRange): number {
  return vr.xMin + ((sx - PAD_L) / PLOT_W) * (vr.xMax - vr.xMin);
}

// ─── 生成曲线路径和填色路径 ────────────────────────────────────────
function buildCurvePath(
  dist: DistType,
  vr: ViewRange,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): string {
  const N = 300;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = vr.xMin + (i / N) * (vr.xMax - vr.xMin);
    let y = 0;
    if (dist === "uniform") y = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") y = expPDF(x, params.lam);
    else y = normalPDF(x, params.mu, params.sigma);
    y = clamp(y, 0, vr.yMax);
    const sx = toSVGX(x, vr);
    const sy = toSVGY(y, vr);
    pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  return pts.join(" ");
}

function buildFillPath(
  dist: DistType,
  lo: number,
  hi: number,
  vr: ViewRange,
  params: { ua: number; ub: number; lam: number; mu: number; sigma: number }
): string {
  const N = 200;
  const pts: string[] = [];
  const baseY = toSVGY(0, vr);
  // 起点在底部
  pts.push(`M${toSVGX(lo, vr).toFixed(2)},${baseY.toFixed(2)}`);
  for (let i = 0; i <= N; i++) {
    const x = lo + (i / N) * (hi - lo);
    let y = 0;
    if (dist === "uniform") y = uniformPDF(x, params.ua, params.ub);
    else if (dist === "exponential") y = expPDF(x, params.lam);
    else y = normalPDF(x, params.mu, params.sigma);
    y = clamp(y, 0, vr.yMax);
    const sx = toSVGX(x, vr);
    const sy = toSVGY(y, vr);
    pts.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  pts.push(`L${toSVGX(hi, vr).toFixed(2)},${baseY.toFixed(2)}`);
  pts.push("Z");
  return pts.join(" ");
}

// ─── 滑块子组件 ──────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  color?: string;
}

function SliderRow({ label, value, min, max, step, onChange, fmt, color }: SliderRowProps) {
  const display = fmt ? fmt(value) : value.toFixed(2);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-right text-[12px] text-[var(--ink-soft)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 cursor-pointer"
        style={{ accentColor: color ?? ACCENT }}
      />
      <span
        className="w-14 shrink-0 rounded px-1 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: (color ?? ACCENT) + "22", color: color ?? ACCENT }}
      >
        {display}
      </span>
    </div>
  );
}

// ─── 无记忆性验证面板 ─────────────────────────────────────────────
interface MemorylessProps {
  lam: number;
}

function MemorylessPanel({ lam }: MemorylessProps) {
  const [s, setS] = useState(1.0);
  const [t, setT] = useState(2.0);

  // P(X > s+t | X > s) = P(X > t)
  const pXgts = Math.exp(-lam * s);
  const pXgtsPlusT = Math.exp(-lam * (s + t));
  const conditional = pXgts > 0 ? pXgtsPlusT / pXgts : 0;
  const pXgtt = Math.exp(-lam * t);
  const match = Math.abs(conditional - pXgtt) < 1e-9;

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-emerald-500/10 p-3 space-y-3">
      <div className="text-[12px] font-semibold text-[#0f766e]">无记忆性验证</div>
      <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">
        指数分布有「无记忆性」：已知 X &gt; s，额外再等 t 的概率，等同于从头等 t。
        即 P(X &gt; s+t | X &gt; s) = P(X &gt; t)。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <SliderRow label="s =" value={s} min={0.1} max={5} step={0.1} onChange={setS} fmt={(v) => v.toFixed(1)} color={TEAL} />
        <SliderRow label="t =" value={t} min={0.1} max={5} step={0.1} onChange={setT} fmt={(v) => v.toFixed(1)} color={ORANGE} />
      </div>
      <div className="rounded bg-[var(--bg-elevated)] px-3 py-2 text-[12px] space-y-1 font-mono">
        <div>
          P(X &gt; s) = e<sup>−λs</sup> ={" "}
          <span style={{ color: TEAL }}>{pXgts.toFixed(6)}</span>
        </div>
        <div>
          P(X &gt; s+t) = e<sup>−λ(s+t)</sup> ={" "}
          <span style={{ color: ACCENT }}>{pXgtsPlusT.toFixed(6)}</span>
        </div>
        <div className="border-t border-[var(--line)] pt-1 mt-1">
          P(X &gt; s+t | X &gt; s) = {pXgtsPlusT.toFixed(6)} / {pXgts.toFixed(6)}{" "}
          ={" "}<span className="font-bold" style={{ color: ORANGE }}>{conditional.toFixed(6)}</span>
        </div>
        <div>
          P(X &gt; t) = e<sup>−λt</sup> ={" "}
          <span className="font-bold" style={{ color: ORANGE }}>{pXgtt.toFixed(6)}</span>
        </div>
        <div
          className="rounded px-2 py-1 text-center font-bold"
          style={{ background: match ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", color: match ? "var(--color-success)" : "var(--md-sys-color-error)" }}
        >
          {match ? "[OK] 两者完全相等，无记忆性成立！" : "数值偏差过大"}
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────
function PDFExplorerBase() {
  const [dist, setDist] = useState<DistType>("normal");

  // 均匀分布参数 [ua, ub]
  const [ua, setUa] = useState(1.0);
  const [ub, setUb] = useState(5.0);

  // 指数分布参数
  const [lam, setLam] = useState(1.0);

  // 正态分布参数
  const [mu, setMu] = useState(0.0);
  const [sigma, setSigma] = useState(1.0);

  // 区间端点 a, b（拖动）
  const [intA, setIntA] = useState(-1.0);
  const [intB, setIntB] = useState(1.0);

  // 拖动状态
  const dragging = useRef<"a" | "b" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // 显示无记忆性面板
  const [showMemoryless, setShowMemoryless] = useState(false);

  const params = { ua, ub, lam, mu, sigma };

  // 根据分布确定视图范围
  const viewRange: ViewRange = (() => {
    if (dist === "uniform") {
      const lo = Math.min(ua, ub) - 0.5;
      const hi = Math.max(ua, ub) + 0.5;
      const yMax = (ub - ua) > 0 ? 1 / (ub - ua) * 1.5 : 2;
      return { xMin: lo, xMax: hi, yMax };
    }
    if (dist === "exponential") {
      const xMax = Math.max(6 / lam, 0.5);
      const yMax = lam * 1.4;
      return { xMin: 0, xMax, yMax };
    }
    // normal
    const span = 4 * sigma;
    return { xMin: mu - span, xMax: mu + span, yMax: normalPDF(mu, mu, sigma) * 1.4 };
  })();

  // 区间端点夹紧到视图内
  const clampedA = clamp(intA, viewRange.xMin, viewRange.xMax);
  const clampedB = clamp(intB, viewRange.xMin, viewRange.xMax);
  const lo = Math.min(clampedA, clampedB);
  const hi = Math.max(clampedA, clampedB);

  // 概率计算
  const prob = trapezoidProb(dist, lo, hi, params);

  // 路径
  const curvePath = buildCurvePath(dist, viewRange, params);
  const fillPath = lo < hi ? buildFillPath(dist, lo, hi, viewRange, params) : "";

  // ─── 拖动处理 ─────────────────────────────────────────────────
  function getSVGX(e: React.MouseEvent | React.TouchEvent): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const clientX =
      "touches" in e
        ? (e as React.TouchEvent).touches[0]?.clientX ?? 0
        : (e as React.MouseEvent).clientX;
    const scaleX = SVG_W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  const onMouseDown = useCallback(
    (handle: "a" | "b") => (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = handle;
      setIsDragging(true);
    },
    []
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) return;
      const svgX = getSVGX(e);
      const worldX = clamp(fromSVGX(svgX, viewRange), viewRange.xMin, viewRange.xMax);
      if (dragging.current === "a") setIntA(parseFloat(worldX.toFixed(3)));
      else setIntB(parseFloat(worldX.toFixed(3)));
    },
     
    [viewRange]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    setIsDragging(false);
  }, []);

  // ─── 轴刻度 ──────────────────────────────────────────────────
  function xTicks(): number[] {
    const count = 5;
    const ticks: number[] = [];
    for (let i = 0; i <= count; i++) {
      ticks.push(viewRange.xMin + (i / count) * (viewRange.xMax - viewRange.xMin));
    }
    return ticks;
  }

  function yTicks(): number[] {
    const steps = [viewRange.yMax * 0.5, viewRange.yMax];
    return steps;
  }

  const handleAx = toSVGX(clampedA, viewRange);
  const handleBx = toSVGX(clampedB, viewRange);
  const baseY = toSVGY(0, viewRange);

  // 分布名称与公式标注
  const distMeta: Record<DistType, { name: string; formula: string; color: string }> = {
    uniform: { name: "均匀分布 U(a,b)", formula: `U(${ua.toFixed(1)}, ${ub.toFixed(1)})`, color: TEAL },
    exponential: { name: "指数分布 Exp(λ)", formula: `Exp(λ=${lam.toFixed(2)})`, color: ORANGE },
    normal: { name: "正态分布 N(μ,σ²)", formula: `N(${mu.toFixed(1)}, ${sigma.toFixed(2)}²)`, color: ACCENT },
  };

  const tabs: DistType[] = ["uniform", "exponential", "normal"];
  const tabLabel: Record<DistType, string> = {
    uniform: "均匀分布",
    exponential: "指数分布",
    normal: "正态分布",
  };

  function handleTabChange(d: DistType) {
    setDist(d);
    setShowMemoryless(false);
    // 重置区间端点到合理位置
    if (d === "uniform") { setIntA(1.5); setIntB(3.5); }
    else if (d === "exponential") { setIntA(0.5); setIntB(2.0); }
    else { setIntA(-1.0); setIntB(1.0); }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">连续分布密度函数探索器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          切换分布、调节参数，拖动区间端点，实时观察概率密度函数与 P(a ≤ X ≤ b) 的面积。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1.5 rounded-lg bg-[var(--bg-muted)] p-1">
        {tabs.map((d) => (
          <button
            key={d}
            onClick={() => handleTabChange(d)}
            className={
              "flex-1 rounded-md py-1 text-[12px] font-semibold transition-all " +
              (dist === d
                ? "bg-[var(--bg-elevated)] shadow text-[var(--ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]")
            }
          >
            {tabLabel[d]}
          </button>
        ))}
      </div>

      {/* 参数滑块区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-2.5">
        {dist === "uniform" && (
          <>
            <SliderRow label="下限 a =" value={ua} min={-4} max={4} step={0.1} onChange={(v) => setUa(Math.min(v, ub - 0.2))} fmt={(v) => v.toFixed(1)} color={TEAL} />
            <SliderRow label="上限 b =" value={ub} min={-4} max={4} step={0.1} onChange={(v) => setUb(Math.max(v, ua + 0.2))} fmt={(v) => v.toFixed(1)} color={TEAL} />
            <p className="text-[11px] text-[var(--ink-soft)]">
              f(x) = 1/(b−a) = {(1 / Math.max(ub - ua, 0.01)).toFixed(4)}，在 [{ua.toFixed(1)}, {ub.toFixed(1)}] 上常数，区间外为 0。
            </p>
          </>
        )}
        {dist === "exponential" && (
          <>
            <SliderRow label="λ =" value={lam} min={0.2} max={5} step={0.1} onChange={setLam} fmt={(v) => v.toFixed(2)} color={ORANGE} />
            <p className="text-[11px] text-[var(--ink-soft)]">
              f(x) = λe<sup>−λx</sup>，均值 = 1/λ = {(1 / lam).toFixed(3)}，方差 = 1/λ² = {(1 / (lam * lam)).toFixed(3)}
            </p>
          </>
        )}
        {dist === "normal" && (
          <>
            <SliderRow label="μ =" value={mu} min={-3} max={3} step={0.1} onChange={setMu} fmt={(v) => v.toFixed(1)} color={ACCENT} />
            <SliderRow label="σ =" value={sigma} min={0.2} max={3} step={0.05} onChange={setSigma} fmt={(v) => v.toFixed(2)} color="#7c3aed" />
            <p className="text-[11px] text-[var(--ink-soft)]">
              f(x) = (2πσ²)^(−1/2) · exp(−(x−μ)²/2σ²)，峰值 = {normalPDF(mu, mu, sigma).toFixed(4)}
            </p>
          </>
        )}
      </div>

      {/* SVG 图形区 */}
      <div className="rounded-lg border border-[var(--line)] overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full select-none"
          style={{ cursor: isDragging ? "col-resize" : "default", touchAction: "none" }}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* 底部矩形 */}
          <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" stroke="var(--line)" />

          {/* Y 轴刻度 */}
          {yTicks().map((yv) => {
            const sy = toSVGY(yv, viewRange);
            return (
              <g key={yv}>
                <line x1={PAD_L} y1={sy} x2={PAD_L + PLOT_W} y2={sy} stroke="var(--line)" strokeDasharray="4 3" />
                <text x={PAD_L - 5} y={sy + 3} fontSize="10" textAnchor="end" fill="var(--ink-faint)">
                  {yv.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* X 轴刻度 */}
          {xTicks().map((xv) => {
            const sx = toSVGX(xv, viewRange);
            return (
              <g key={xv}>
                <line x1={sx} y1={PAD_T} x2={sx} y2={PAD_T + PLOT_H} stroke="var(--line)" />
                <text x={sx} y={PAD_T + PLOT_H + 13} fontSize="10" textAnchor="middle" fill="var(--ink-faint)">
                  {xv.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* 填色面积 */}
          {fillPath && (
            <path d={fillPath} fill={FILL_COLOR} fillOpacity={FILL_OPACITY} />
          )}

          {/* PDF 曲线 */}
          <path d={curvePath} fill="none" stroke={distMeta[dist].color} strokeWidth="2.2" strokeLinejoin="round" />

          {/* 区间竖线 */}
          {[clampedA, clampedB].map((xv, idx) => {
            const sx = toSVGX(xv, viewRange);
            return (
              <line key={idx} x1={sx} y1={PAD_T} x2={sx} y2={baseY} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="5 3" opacity={0.7} />
            );
          })}

          {/* 拖动手柄 a */}
          <g
            style={{ cursor: "col-resize" }}
            onMouseDown={onMouseDown("a")}
          >
            <circle cx={handleAx} cy={baseY - 1} r={7} fill={ACCENT} opacity={0.9} />
            <text x={handleAx} y={baseY - 1 + 4} fontSize="10" textAnchor="middle" fill="white" fontWeight="bold">a</text>
            <text x={handleAx} y={baseY + 24} fontSize="10" textAnchor="middle" fill={ACCENT}>
              {clampedA.toFixed(2)}
            </text>
          </g>

          {/* 拖动手柄 b */}
          <g
            style={{ cursor: "col-resize" }}
            onMouseDown={onMouseDown("b")}
          >
            <circle cx={handleBx} cy={baseY - 1} r={7} fill="#7c3aed" opacity={0.9} />
            <text x={handleBx} y={baseY - 1 + 4} fontSize="10" textAnchor="middle" fill="white" fontWeight="bold">b</text>
            <text x={handleBx} y={baseY + 24} fontSize="10" textAnchor="middle" fill="#7c3aed">
              {clampedB.toFixed(2)}
            </text>
          </g>

          {/* 轴标签 */}
          <text x={PAD_L - 5} y={PAD_T - 5} fontSize="10" fill="var(--ink-faint)" textAnchor="end">f(x)</text>
          <text x={PAD_L + PLOT_W} y={PAD_T + PLOT_H + 28} fontSize="10" fill="var(--ink-faint)" textAnchor="end">x</text>

          {/* 分布标注 */}
          <text x={PAD_L + 8} y={PAD_T + 14} fontSize="11" fill={distMeta[dist].color} fontWeight="600">
            {distMeta[dist].formula}
          </text>
        </svg>
      </div>

      {/* 区间控制与概率显示 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-2 rounded-lg border-2 p-3 text-center"
          style={{ borderColor: ACCENT, background: ACCENT_LIGHT }}>
          <div className="text-[11px] text-[var(--ink-soft)]">P(a ≤ X ≤ b) — 紫色面积</div>
          <div className="text-[28px] font-extrabold font-mono mt-0.5" style={{ color: ACCENT }}>
            {prob.toFixed(6)}
          </div>
          <div className="text-[11px] text-[var(--ink-soft)] mt-0.5">
            [{Math.min(clampedA, clampedB).toFixed(3)},  {Math.max(clampedA, clampedB).toFixed(3)}]
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-muted)] p-3 text-center">
          <div className="text-[10px] text-[var(--ink-soft)]">端点 a</div>
          <div className="text-[18px] font-extrabold font-mono mt-0.5" style={{ color: ACCENT }}>
            {clampedA.toFixed(3)}
          </div>
          <div className="text-[10px] text-[var(--ink-soft)]">拖动蓝点</div>
        </div>
        <div className="rounded-lg bg-[var(--bg-muted)] p-3 text-center">
          <div className="text-[10px] text-[var(--ink-soft)]">端点 b</div>
          <div className="text-[18px] font-extrabold font-mono mt-0.5" style={{ color: "#7c3aed" }}>
            {clampedB.toFixed(3)}
          </div>
          <div className="text-[10px] text-[var(--ink-soft)]">拖动紫点</div>
        </div>
      </div>

      {/* 精调滑块 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-2.5">
        <div className="text-[12px] font-semibold text-[var(--ink)]">精调区间端点（也可直接拖动图上圆点）</div>
        <SliderRow
          label="端点 a ="
          value={clampedA}
          min={viewRange.xMin}
          max={viewRange.xMax}
          step={0.01}
          onChange={(v) => setIntA(v)}
          fmt={(v) => v.toFixed(2)}
          color={ACCENT}
        />
        <SliderRow
          label="端点 b ="
          value={clampedB}
          min={viewRange.xMin}
          max={viewRange.xMax}
          step={0.01}
          onChange={(v) => setIntB(v)}
          fmt={(v) => v.toFixed(2)}
          color="#7c3aed"
        />
      </div>

      {/* 知识提示 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
        {dist === "uniform" && (
          <p>
            <span className="font-semibold text-[var(--ink)]">均匀分布：</span>
            密度函数为常数，面积 = 长度 × 高度 = (b−a) × 1/(B−A)。全区间积分恒为 1。
          </p>
        )}
        {dist === "exponential" && (
          <p>
            <span className="font-semibold text-[var(--ink)]">指数分布：</span>
            常用于描述等待时间/寿命，λ 越大衰减越快。P(X &gt; t) = e<sup>−λt</sup>。
            唯一具有「无记忆性」的连续分布。
          </p>
        )}
        {dist === "normal" && (
          <p>
            <span className="font-semibold text-[var(--ink)]">正态分布：</span>
            钟形曲线，μ 控制中心，σ 控制胖瘦。P(μ−σ ≤ X ≤ μ+σ) ≈ 68.3%，
            P(μ−2σ ≤ X ≤ μ+2σ) ≈ 95.4%。
          </p>
        )}
      </div>

      {/* 指数分布无记忆性 */}
      {dist === "exponential" && (
        <div>
          <button
            onClick={() => setShowMemoryless((v) => !v)}
            className={
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all " +
              (showMemoryless
                ? "bg-[#0d9488] text-white"
                : "bg-teal-500/10 text-[#0f766e] hover:bg-[#0d9488] hover:text-white")
            }
          >
            {showMemoryless ? "收起" : "展开"} 无记忆性验证
          </button>
          {showMemoryless && <MemorylessPanel lam={lam} />}
        </div>
      )}
    </div>
  );
}

export default memo(PDFExplorerBase);
