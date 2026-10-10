"use client";

import { parseSamples as parseData } from '@/lib/learning/probability/samples';

import { memo, useState, useRef, useCallback } from "react";

// ─── 设计常量 ────────────────────────────────────────────────────
const ACCENT = "#5b46e5"; // 与 alpha 拼接（如 `${ACCENT}30`），保留 hex
const ACCENT_LIGHT = "var(--accent-weak)";
const MLE_COLOR = "#0f766e";
const MLE_LIGHT = "#0f766e22"; // 半透明青绿，深浅色皆可读
const CURSOR_COLOR = "#f59e0b";
const CURVE_COLOR = "#5b46e5";

// ─── SVG 布局参数 ─────────────────────────────────────────────────
const SVG_W = 520;
const SVG_H = 220;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 18;
const PAD_B = 36;
const CHART_W = SVG_W - PAD_L - PAD_R;
const CHART_H = SVG_H - PAD_T - PAD_B;

// ─── 分布类型 ─────────────────────────────────────────────────────
type DistType = "exponential" | "bernoulli";

// ─── 辅助：数值精度格式化 ─────────────────────────────────────────
function fmt(v: number, d = 4): string {
  return v.toFixed(d);
}

// ─── 对数似然计算 ─────────────────────────────────────────────────
function logLikelihood(dist: DistType, theta: number, data: number[]): number {
  if (data.length === 0) return -Infinity;
  if (dist === "exponential") {
    // X ~ Exp(λ), θ = λ > 0
    // logL = n·ln(λ) - λ·Σxᵢ
    if (theta <= 0) return -Infinity;
    const n = data.length;
    const sumX = data.reduce((s, x) => s + x, 0);
    return n * Math.log(theta) - theta * sumX;
  } else {
    // X ~ Bernoulli(p), θ = p ∈ (0,1)
    // logL = k·ln(p) + (n-k)·ln(1-p)
    if (theta <= 0 || theta >= 1) return -Infinity;
    const n = data.length;
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    const ll1 = k > 0 ? k * Math.log(theta) : 0;
    const ll2 = n - k > 0 ? (n - k) * Math.log(1 - theta) : 0;
    return ll1 + ll2;
  }
}

// ─── MLE 解析解 ──────────────────────────────────────────────────
function computeMLE(dist: DistType, data: number[]): number {
  if (data.length === 0) return NaN;
  if (dist === "exponential") {
    // θ̂ = 1 / x̄
    const mean = data.reduce((s, x) => s + x, 0) / data.length;
    return mean > 0 ? 1 / mean : NaN;
  } else {
    // θ̂ = k/n
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    return k / data.length;
  }
}

// ─── θ 轴范围配置 ────────────────────────────────────────────────
interface ThetaRange {
  min: number;
  max: number;
  label: string;
  unit: string;
}

function getThetaRange(dist: DistType): ThetaRange {
  if (dist === "exponential") {
    return { min: 0.05, max: 5, label: "λ（率参数）", unit: "" };
  }
  return { min: 0.01, max: 0.99, label: "p（成功概率）", unit: "" };
}

// ─── 生成默认样本 ─────────────────────────────────────────────────
function defaultData(dist: DistType): number[] {
  if (dist === "exponential") {
    // 指数分布均值=1，λ=1，MLE 解析解 = 1.0
    return [0.5, 1.2, 0.8, 2.1, 0.3, 1.5, 0.9, 0.4, 1.8, 0.6];
  }
  // 伯努利，约 6/10 成功，MLE = 0.6
  return [1, 0, 1, 1, 0, 1, 0, 1, 1, 0];
}

// ─── SVG 坐标映射 ─────────────────────────────────────────────────
function svgX(theta: number, tMin: number, tMax: number): number {
  return PAD_L + ((theta - tMin) / (tMax - tMin)) * CHART_W;
}

function svgY(ll: number, llMin: number, llMax: number): number {
  if (!isFinite(ll)) return PAD_T + CHART_H;
  const ratio = (ll - llMin) / (llMax - llMin);
  return PAD_T + CHART_H * (1 - Math.max(0, Math.min(1, ratio)));
}

// ─── 曲线路径生成 ─────────────────────────────────────────────────
function buildCurvePath(
  dist: DistType,
  data: number[],
  tMin: number,
  tMax: number,
  llMin: number,
  llMax: number,
  steps = 200
): { path: string; points: Array<{ theta: number; ll: number }> } {
  const points: Array<{ theta: number; ll: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const theta = tMin + (i / steps) * (tMax - tMin);
    const ll = logLikelihood(dist, theta, data);
    points.push({ theta, ll });
  }
  // 仅保留有限值点
  const finitePoints = points.filter((p) => isFinite(p.ll));
  if (finitePoints.length < 2) return { path: "", points };

  const segs: string[] = [];
  let inSeg = false;
  for (const { theta, ll } of points) {
    if (!isFinite(ll)) {
      inSeg = false;
      continue;
    }
    const cx = svgX(theta, tMin, tMax);
    const cy = svgY(ll, llMin, llMax);
    if (!inSeg) {
      segs.push(`M${cx.toFixed(2)},${cy.toFixed(2)}`);
      inSeg = true;
    } else {
      segs.push(`L${cx.toFixed(2)},${cy.toFixed(2)}`);
    }
  }
  return { path: segs.join(" "), points };
}

// ─── MLE 公式文字 ─────────────────────────────────────────────────
function mleFormula(dist: DistType, data: number[], mle: number): string {
  if (dist === "exponential") {
    const n = data.length;
    const sumX = data.reduce((s, x) => s + x, 0).toFixed(4);
    const mean = (parseFloat(sumX) / n).toFixed(4);
    return `θ̂ = λ̂ = n / Σxᵢ = ${n} / ${sumX} = 1 / x̄ = 1 / ${mean} = ${fmt(mle)}`;
  } else {
    const n = data.length;
    const k = data.reduce((s, x) => s + (x > 0.5 ? 1 : 0), 0);
    return `θ̂ = p̂ = k / n = ${k} / ${n} = ${fmt(mle)}`;
  }
}

// ─── 数值区间 ─────────────────────────────────────────────────────
function computeLLRange(
  dist: DistType,
  data: number[],
  tMin: number,
  tMax: number,
  steps = 200
): { llMin: number; llMax: number } {
  let llMin = Infinity;
  let llMax = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const theta = tMin + (i / steps) * (tMax - tMin);
    const ll = logLikelihood(dist, theta, data);
    if (isFinite(ll)) {
      if (ll < llMin) llMin = ll;
      if (ll > llMax) llMax = ll;
    }
  }
  if (!isFinite(llMin) || !isFinite(llMax)) return { llMin: -10, llMax: 0 };
  // 给顶部留一点空间
  const span = llMax - llMin || 1;
  return { llMin: llMin - span * 0.1, llMax: llMax + span * 0.15 };
}

// ─── 滑块子组件 ──────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt_fn: (v: number) => string;
  onChange: (v: number) => void;
  color?: string;
}

function SliderRow({ label, value, min, max, step, fmt_fn, onChange, color }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[12px] font-semibold text-[var(--ink)]">{label}</span>
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
        className="w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: ACCENT_LIGHT, color: color ?? ACCENT }}
      >
        {fmt_fn(value)}
      </span>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────
function MLEExplorerBase() {
  const [dist, setDist] = useState<DistType>("exponential");
  const [dataText, setDataText] = useState<string>("0.5, 1.2, 0.8, 2.1, 0.3, 1.5, 0.9, 0.4, 1.8, 0.6");
  const [cursorTheta, setCursorTheta] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // 解析数据
  const data = parseData(dataText);
  const tRange = getThetaRange(dist);
  const tMin = tRange.min;
  const tMax = tRange.max;

  // 计算 MLE 和对数似然范围
  const mle = computeMLE(dist, data);
  const { llMin, llMax } = computeLLRange(dist, data, tMin, tMax);
  const llAtCursor = data.length > 0 ? logLikelihood(dist, cursorTheta, data) : NaN;
  const llAtMLE = data.length > 0 ? logLikelihood(dist, mle, data) : NaN;

  // 曲线路径
  const { path: curvePath } = buildCurvePath(dist, data, tMin, tMax, llMin, llMax);

  // 把 SVG 内鼠标 x 坐标换算成 θ
  const xToTheta = useCallback(
    (clientX: number): number => {
      if (!svgRef.current) return cursorTheta;
      const rect = svgRef.current.getBoundingClientRect();
      const svgXLocal = ((clientX - rect.left) / rect.width) * SVG_W;
      const raw = tMin + ((svgXLocal - PAD_L) / CHART_W) * (tMax - tMin);
      return Math.max(tMin, Math.min(tMax, raw));
    },
    [tMin, tMax, cursorTheta]
  );

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!isDragging) return;
    setCursorTheta(xToTheta(e.clientX));
  }

  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    setIsDragging(true);
    setCursorTheta(xToTheta(e.clientX));
  }

  function handleSvgMouseUp() {
    setIsDragging(false);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    setCursorTheta(xToTheta(e.clientX));
  }

  // 触摸支持
  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault();
    if (e.touches.length > 0) {
      setCursorTheta(xToTheta(e.touches[0].clientX));
    }
  }

  // 切换分布时重置
  function switchDist(d: DistType) {
    setDist(d);
    const dd = defaultData(d);
    setDataText(dd.join(", "));
    const r = getThetaRange(d);
    setCursorTheta((r.min + r.max) / 2);
  }

  // 随机生成样本（在事件处理函数内使用 Math.random）
  function randomSamples() {
    const n = 10;
    if (dist === "exponential") {
      const lambda = 1.5;
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        arr.push(parseFloat((-Math.log(1 - Math.random()) / lambda).toFixed(3)));
      }
      setDataText(arr.join(", "));
    } else {
      const p = 0.3 + Math.random() * 0.4; // p ∈ [0.3, 0.7]
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        arr.push(Math.random() < p ? 1 : 0);
      }
      setDataText(arr.join(", "));
    }
  }

  // SVG 中 cursor 与 MLE 的像素位置
  const cxCursor = svgX(Math.max(tMin, Math.min(tMax, cursorTheta)), tMin, tMax);
  const cyCursor = isFinite(llAtCursor) ? svgY(llAtCursor, llMin, llMax) : PAD_T + CHART_H;
  const cxMLE = isFinite(mle) ? svgX(Math.max(tMin, Math.min(tMax, mle)), tMin, tMax) : -999;
  const cyMLE = isFinite(llAtMLE) ? svgY(llAtMLE, llMin, llMax) : PAD_T + CHART_H;

  // Y 轴刻度（最多 5 个）
  const yTickValues: number[] = [];
  {
    const span = llMax - llMin;
    const rawStep = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))));
    const step = Math.ceil(rawStep / mag) * mag;
    const startVal = Math.ceil(llMin / step) * step;
    for (let v = startVal; v <= llMax + 1e-9; v += step) {
      yTickValues.push(v);
    }
  }

  // θ 轴刻度（5 个）
  const xTickValues: number[] = [];
  for (let i = 0; i <= 4; i++) {
    xTickValues.push(tMin + (i / 4) * (tMax - tMin));
  }

  const formulaStr = data.length > 0 && isFinite(mle) ? mleFormula(dist, data, mle) : "请输入有效样本数据";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">极大似然估计可视化</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          输入样本，观察对数似然函数曲线；拖动蓝色竖线探索不同 θ 值，
          感受 MLE 峰值处恰好是最优估计。
        </p>
      </div>

      {/* 控制面板 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        {/* 分布选择 */}
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-[12px] font-semibold text-[var(--ink)]">选分布</span>
          <div className="flex gap-1.5">
            {(["exponential", "bernoulli"] as DistType[]).map((d) => (
              <button
                key={d}
                onClick={() => switchDist(d)}
                className={
                  "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
                  (d === dist
                    ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                    : "bg-[var(--bg-elevated)] border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]")
                }
              >
                {d === "exponential" ? "指数分布 Exp(λ)" : "伯努利分布 B(p)"}
              </button>
            ))}
          </div>
        </div>

        {/* θ 游标滑块 */}
        <SliderRow
          label={`当前 θ（${tRange.label}）`}
          value={parseFloat(cursorTheta.toFixed(4))}
          min={tMin}
          max={tMax}
          step={dist === "exponential" ? 0.01 : 0.005}
          fmt_fn={(v) => v.toFixed(3)}
          onChange={setCursorTheta}
          color={CURSOR_COLOR}
        />
      </div>

      {/* 样本数据输入 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            样本数据
            {data.length > 0 && (
              <span className="ml-2 font-normal text-[var(--ink-soft)]">
                （n = {data.length}，
                {dist === "exponential"
                  ? `x̄ = ${(data.reduce((s, x) => s + x, 0) / data.length).toFixed(4)}`
                  : `k = ${data.filter((x) => x > 0.5).length}`}）
              </span>
            )}
          </span>
          <button
            onClick={randomSamples}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--line)] px-2.5 py-0.5 text-[11px] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            随机生成
          </button>
        </div>
        <textarea
          value={dataText}
          onChange={(e) => setDataText(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] font-mono text-[var(--ink)] placeholder-[var(--ink-soft)] focus:outline-none focus:border-[var(--accent)] resize-none"
          placeholder={
            dist === "exponential"
              ? "输入正实数，逗号/空格分隔，如: 0.5, 1.2, 0.8, 2.1, 0.3"
              : "输入 0/1 序列，逗号/空格分隔，如: 1, 0, 1, 1, 0, 1"
          }
          spellCheck={false}
        />
        {data.length === 0 && dataText.trim() !== "" && (
          <p className="text-[11px] text-[var(--md-sys-color-error)]">无法解析数据，请检查格式</p>
        )}
      </div>

      {/* 对数似然曲线 SVG */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            对数似然函数 logL(θ | x₁,…,xₙ)
          </span>
          <span className="text-[11px] text-[var(--ink-soft)]">
            点击 / 拖动图表探索 θ
          </span>
        </div>
        <svg
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
        </svg>
      </div>

      {/* 核心数值对比卡片 */}
      {data.length > 0 && isFinite(mle) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* MLE 值 */}
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: MLE_LIGHT, border: `1.5px solid ${MLE_COLOR}30` }}
          >
            <div className="text-[10px] text-[var(--ink-soft)] mb-0.5">MLE 估计量 θ̂</div>
            <div className="text-[22px] font-extrabold font-mono" style={{ color: MLE_COLOR }}>
              {fmt(mle)}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: MLE_COLOR }}>
              logL(θ̂) = {fmt(llAtMLE, 2)}
            </div>
          </div>

          {/* 当前 θ */}
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#f59e0b1f", border: `1.5px solid ${CURSOR_COLOR}40` }}
          >
            <div className="text-[10px] text-[var(--ink-soft)] mb-0.5">当前游标 θ</div>
            <div className="text-[22px] font-extrabold font-mono" style={{ color: CURSOR_COLOR }}>
              {fmt(cursorTheta)}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: CURSOR_COLOR }}>
              logL(θ) = {isFinite(llAtCursor) ? fmt(llAtCursor, 2) : "−∞"}
            </div>
          </div>

          {/* logL 差值 */}
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: ACCENT_LIGHT, border: `1.5px solid ${ACCENT}30` }}
          >
            <div className="text-[10px] text-[var(--ink-soft)] mb-0.5">
              与 MLE 的 logL 差值
            </div>
            <div
              className="text-[22px] font-extrabold font-mono"
              style={{
                color:
                  isFinite(llAtCursor) && Math.abs(llAtCursor - llAtMLE) < 0.01
                    ? MLE_COLOR
                    : ACCENT,
              }}
            >
              {isFinite(llAtCursor)
                ? (llAtCursor - llAtMLE >= 0 ? "+" : "") + fmt(llAtCursor - llAtMLE, 2)
                : "−∞"}
            </div>
            <div className="text-[10px] mt-0.5 text-[var(--ink-soft)]">
              {isFinite(llAtCursor) && Math.abs(llAtCursor - llAtMLE) < 0.05
                ? "近似最优！"
                : "向左/右移动减小差值"}
            </div>
          </div>
        </div>
      )}

      {/* MLE 公式（实时更新） */}
      <div
        className="rounded-lg px-4 py-3 space-y-2"
        style={{ background: `${MLE_COLOR}08`, border: `1px solid ${MLE_COLOR}30` }}
      >
        <div className="text-[12px] font-semibold text-[var(--ink)]">
          {dist === "exponential" ? "指数分布 MLE 解析解" : "伯努利分布 MLE 解析解"}
        </div>
        <div className="font-mono text-[11px] text-[var(--ink-soft)] leading-loose">
          {dist === "exponential" ? (
            <>
              <div>logL(λ) = n·ln λ − λ·Σxᵢ</div>
              <div>d logL / dλ = n/λ − Σxᵢ = 0 → <strong style={{ color: MLE_COLOR }}>λ̂ = n / Σxᵢ = 1 / x̄</strong></div>
            </>
          ) : (
            <>
              <div>logL(p) = k·ln p + (n−k)·ln(1−p)</div>
              <div>d logL / dp = k/p − (n−k)/(1−p) = 0 → <strong style={{ color: MLE_COLOR }}>p̂ = k / n</strong></div>
            </>
          )}
        </div>
        <div
          className="rounded-md px-3 py-2 font-mono text-[12px] font-bold"
          style={{ background: MLE_LIGHT, color: MLE_COLOR }}
        >
          {formulaStr}
        </div>
      </div>

      {/* 直觉说明 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">直觉：</span>
        极大似然估计寻找{'"使当前样本出现概率最大"'}的参数 θ̂。
        对数似然曲线的<strong style={{ color: MLE_COLOR }}>峰值</strong>就是该最优点——
        拖动黄色游标线，你会发现越靠近 θ̂，对数似然越高；
        偏离时似然值迅速下降，这正是 MLE 的{'"几何直觉"'}。
      </div>
    </div>
  );
}

export default memo(MLEExplorerBase);
