"use client";

import { parseSamples as parseData } from '@/lib/learning/probability/samples';
import { LikelihoodPlot } from "./MLEExplorer/LikelihoodPlot";
import { memo, useState, useRef, useCallback } from "react";
import { getThetaRange, computeMLE, computeLLRange, logLikelihood, defaultData } from "@/lib/learning/probability/estimation/likelihood";
import type { DistType } from "@/lib/learning/probability/estimation/likelihood";
import { buildCurvePath, svgX, svgY } from "./MLEExplorer/geometry";
import { SVG_W, PAD_L, CHART_W, PAD_T, CHART_H, CURSOR_COLOR, MLE_COLOR, MLE_LIGHT, ACCENT_LIGHT, ACCENT } from "./MLEExplorer/appearance";
import { mleFormula, fmt } from "./MLEExplorer/formatters";
import { SliderRow } from "./MLEExplorer/controls";
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
        <LikelihoodPlot svgRef={svgRef} handleSvgMouseDown={handleSvgMouseDown} handleSvgMouseMove={handleSvgMouseMove} handleSvgMouseUp={handleSvgMouseUp} handleSvgClick={handleSvgClick} handleTouchMove={handleTouchMove} setCursorTheta={setCursorTheta} xToTheta={xToTheta} yTickValues={yTickValues} llMin={llMin} llMax={llMax} xTickValues={xTickValues} tMin={tMin} tMax={tMax} dist={dist} tRange={tRange} curvePath={curvePath} data={data} mle={mle} cxMLE={cxMLE} cyMLE={cyMLE} cxCursor={cxCursor} llAtCursor={llAtCursor} cyCursor={cyCursor} cursorTheta={cursorTheta} />
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