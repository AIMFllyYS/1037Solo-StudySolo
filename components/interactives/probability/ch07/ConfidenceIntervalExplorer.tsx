"use client";

import { memo, useState } from "react";
import { invNorm, invT, MU, SIGMA, randNorm, MAX_INTERVALS } from "@/lib/learning/probability/estimation/confidenceIntervals";
import type { Interval } from "@/lib/learning/probability/estimation/confidenceIntervals";
import { SliderRow } from "./ConfidenceIntervalExplorer/controls";
import { pct } from "./ConfidenceIntervalExplorer/formatters";
import { ACCENT, GREEN, RED, GREEN_LIGHT, RED_LIGHT, ACCENT_LIGHT } from "./ConfidenceIntervalExplorer/appearance";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function ConfidenceIntervalExplorerBase() {
  // 参数状态
  const [confidenceLevel, setConfidenceLevel] = useState(0.95); // 1 - α
  const [n, setN] = useState(20);                               // 样本量
  const [useZ, setUseZ] = useState(true);                       // true=Z区间(σ已知), false=t区间(σ未知)

  // 模拟结果
  const [intervals, setIntervals] = useState<Interval[]>([]);

  // ─── 计算分位数 ───────────────────────────────────────────────
  const alpha = 1 - confidenceLevel;
  const criticalZ = invNorm(1 - alpha / 2);
  const criticalT = invT(1 - alpha / 2, n - 1);
  const critVal = useZ ? criticalZ : criticalT;

  // ─── 模拟抽样 ─────────────────────────────────────────────────
  function simulate(count: number) {
    const newIntervals: Interval[] = [];
    for (let i = 0; i < count; i++) {
      // 抽 n 个观测值（来自 N(MU, SIGMA²)）
      let sum = 0;
      let sumSq = 0;
      for (let j = 0; j < n; j++) {
        const x = MU + SIGMA * randNorm();
        sum += x;
        sumSq += x * x;
      }
      const xbar = sum / n;
      // 样本标准差（用于 t 区间）
      const s = Math.sqrt((sumSq - n * xbar * xbar) / (n - 1));
      const se = useZ ? SIGMA / Math.sqrt(n) : s / Math.sqrt(n);
      const lo = xbar - critVal * se;
      const hi = xbar + critVal * se;
      newIntervals.push({ mean: xbar, lo, hi, covers: lo <= MU && MU <= hi });
    }
    setIntervals((prev) => {
      const combined = [...prev, ...newIntervals];
      // 超出上限则裁剪最旧的
      if (combined.length > MAX_INTERVALS) {
        return combined.slice(combined.length - MAX_INTERVALS);
      }
      return combined;
    });
  }

  function reset() {
    setIntervals([]);
  }

  // ─── 统计摘要 ─────────────────────────────────────────────────
  const total = intervals.length;
  const covered = intervals.filter((iv) => iv.covers).length;
  const empiricalRate = total > 0 ? covered / total : 0;
  const targetRate = confidenceLevel;
  const diff = total > 0 ? empiricalRate - targetRate : 0;

  // ─── SVG 可视化参数 ───────────────────────────────────────────
  // 显示最新的 50 条（纵向排列，从下到上为最新）
  const DISPLAY_N = 50;
  const displayed = intervals.slice(-DISPLAY_N);
  const SVG_W = 480;
  const SVG_H = Math.max(160, displayed.length * 10 + 40);
  const MARGIN_L = 80;
  const MARGIN_R = 20;
  const MARGIN_T = 24;
  const MARGIN_B = 20;
  const plotW = SVG_W - MARGIN_L - MARGIN_R;
  const plotH = SVG_H - MARGIN_T - MARGIN_B;

  // x 轴范围：固定为 [-3, 3]（覆盖几乎所有区间）
  const X_MIN = -3.5;
  const X_MAX = 3.5;
  const xScale = (v: number) => MARGIN_L + ((v - X_MIN) / (X_MAX - X_MIN)) * plotW;
  const yScale = (idx: number) => MARGIN_T + plotH - ((idx + 0.5) / Math.max(displayed.length, 1)) * plotH;

  // μ 线 x 位置
  const muX = xScale(MU);

  // x 轴刻度
  const xTicks = [-3, -2, -1, 0, 1, 2, 3];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题区 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">置信区间捕获率可视化</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          每次模拟从 N(0,1) 中抽取样本，构造置信区间。
          绿色区间覆盖真值 μ=0，红色未覆盖。
          反复点击「模拟 50 次」，观察实际覆盖率是否趋近声称的 1−α。
        </p>
      </div>

      {/* 参数控制区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-4">
        <SliderRow
          label="置信水平 1−α"
          value={confidenceLevel}
          display={pct(confidenceLevel)}
          min={0.80}
          max={0.99}
          step={0.01}
          onChange={(v) => { setConfidenceLevel(v); reset(); }}
        />
        <SliderRow
          label="样本量 n"
          value={n}
          display={String(n)}
          min={5}
          max={50}
          step={1}
          onChange={(v) => { setN(v); reset(); }}
        />
        {/* σ 已知 / 未知 切换 */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[var(--ink)]">区间类型</span>
          <div className="flex rounded-lg overflow-hidden border border-[var(--line)]">
            {[
              { label: "Z 区间（σ 已知）", val: true },
              { label: "t 区间（σ 未知）", val: false },
            ].map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() => { setUseZ(opt.val); reset(); }}
                className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: useZ === opt.val ? ACCENT : "transparent",
                  color: useZ === opt.val ? "white" : "var(--ink-soft)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--ink-soft)] ml-1">
            临界值 {useZ ? "z" : "t"}
            <sub>{useZ ? "α/2" : `α/2,${n-1}`}</sub>
            {" = "}
            <b className="font-mono text-[var(--ink)]">{critVal.toFixed(4)}</b>
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => simulate(50)}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[var(--md-sys-color-on-primary)] transition-opacity hover:opacity-90"
          style={{ background: ACCENT }}
        >
          模拟 50 次
        </button>
        <button
          onClick={() => simulate(1)}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[var(--md-sys-color-on-primary)] transition-opacity hover:opacity-90"
          style={{ background: GREEN }}
        >
          模拟 1 次
        </button>
        <button
          onClick={reset}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--ink-soft)] bg-[var(--bg-muted)] hover:bg-[var(--line)] transition-colors"
        >
          清除重置
        </button>
        {total > 0 && (
          <span className="text-[12px] text-[var(--ink-soft)] ml-1">
            已累积 <b className="text-[var(--ink)] font-mono">{total}</b> 次（最多显示末 50 条）
          </span>
        )}
      </div>

      {/* 主可视化区：左侧区间图 + 右侧统计 */}
      <div className="flex gap-4 items-start">
        {/* SVG 区间图 */}
        <div className="flex-1 min-w-0">
          {total === 0 ? (
            <div
              className="flex items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-[13px] text-[var(--ink-soft)]"
              style={{ height: 200 }}
            >
              点击「模拟 50 次」开始可视化
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full rounded-lg border border-[var(--line)]"
              style={{ maxHeight: 400, display: "block" }}
            >
              {/* 背景 */}
              <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="var(--bg-muted)" />
              <rect
                x={MARGIN_L} y={MARGIN_T}
                width={plotW} height={plotH}
                fill="var(--bg-elevated)" stroke="var(--line)"
              />

              {/* x 轴刻度线与标签 */}
              {xTicks.map((v) => (
                <g key={v}>
                  <line
                    x1={xScale(v)} y1={MARGIN_T}
                    x2={xScale(v)} y2={MARGIN_T + plotH}
                    stroke="var(--line)" strokeWidth={1}
                    strokeDasharray={v === 0 ? undefined : "3 3"}
                  />
                  <text
                    x={xScale(v)}
                    y={MARGIN_T + plotH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--ink-faint)"
                  >
                    {v}
                  </text>
                </g>
              ))}

              {/* 标题标签 */}
              <text x={MARGIN_L - 8} y={MARGIN_T - 8} fontSize={9} fill="var(--ink-faint)" textAnchor="end">
                第 k 次
              </text>
              <text x={SVG_W / 2} y={SVG_H - 4} fontSize={9} fill="var(--ink-faint)" textAnchor="middle">
                样本均值 x̄
              </text>

              {/* 每条置信区间 */}
              {displayed.map((iv, idx) => {
                const y = yScale(idx);
                const x1 = Math.max(xScale(iv.lo), MARGIN_L);
                const x2 = Math.min(xScale(iv.hi), MARGIN_L + plotW);
                const cx = Math.max(MARGIN_L, Math.min(xScale(iv.mean), MARGIN_L + plotW));
                const color = iv.covers ? GREEN : RED;
                const fillColor = iv.covers ? GREEN_LIGHT : RED_LIGHT;
                // 序号（从下往上：最早在下，最新在上 -- 显示最近末 DISPLAY_N 条）
                const seqNum = Math.max(0, total - DISPLAY_N) + idx + 1;
                return (
                  <g key={idx}>
                    {/* 序号 */}
                    <text
                      x={MARGIN_L - 4}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={7}
                      fill="var(--ink-faint)"
                    >
                      {seqNum}
                    </text>
                    {/* 区间矩形（细）*/}
                    <rect
                      x={x1}
                      y={y - 3}
                      width={Math.max(0, x2 - x1)}
                      height={6}
                      fill={fillColor}
                      stroke={color}
                      strokeWidth={0.8}
                      opacity={0.85}
                      rx={1}
                    />
                    {/* 样本均值点 */}
                    <circle cx={cx} cy={y} r={2} fill={color} />
                  </g>
                );
              })}

              {/* μ = 0 的垂直线（最上层）*/}
              <line
                x1={muX} y1={MARGIN_T - 4}
                x2={muX} y2={MARGIN_T + plotH + 4}
                stroke={ACCENT}
                strokeWidth={2}
                strokeDasharray="5 3"
              />
              <text x={muX + 4} y={MARGIN_T - 6} fontSize={9} fill={ACCENT} fontWeight="bold">
                μ=0
              </text>
            </svg>
          )}
        </div>

        {/* 右侧统计面板 */}
        <div className="flex-shrink-0 w-44 space-y-3">
          {/* 覆盖率 */}
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: ACCENT_LIGHT }}
          >
            <div className="text-[11px] text-[var(--ink-soft)] leading-snug mb-1">声称置信水平</div>
            <div className="text-[22px] font-extrabold font-mono" style={{ color: ACCENT }}>
              {pct(targetRate)}
            </div>
          </div>

          <div
            className="rounded-lg p-3 text-center"
            style={{
              background: total === 0
                ? "var(--bg-muted)"
                : Math.abs(diff) < 0.05
                  ? GREEN_LIGHT
                  : RED_LIGHT,
            }}
          >
            <div className="text-[11px] text-[var(--ink-soft)] leading-snug mb-1">实际覆盖率</div>
            <div
              className="text-[22px] font-extrabold font-mono"
              style={{
                color: total === 0
                  ? "var(--ink-faint)"
                  : Math.abs(diff) < 0.05
                    ? GREEN
                    : RED,
              }}
            >
              {total === 0 ? "—" : pct(empiricalRate)}
            </div>
            {total > 0 && (
              <div className="text-[11px] text-[var(--ink-soft)] mt-1">
                {covered} / {total}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--ink-soft)]">覆盖</span>
                <span className="font-semibold font-mono" style={{ color: GREEN }}>{covered}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--ink-soft)]">未覆盖</span>
                <span className="font-semibold font-mono" style={{ color: RED }}>{total - covered}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--ink-soft)]">偏差</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: Math.abs(diff) < 0.03 ? GREEN : RED }}
                >
                  {diff >= 0 ? "+" : ""}{pct(diff)}
                </span>
              </div>
            </div>
          )}

          {/* 图例 */}
          <div className="rounded-lg border border-[var(--line)] p-2.5 space-y-1.5">
            <div className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1">图例</div>
            {[
              { color: GREEN, bg: GREEN_LIGHT, label: "覆盖 μ" },
              { color: RED, bg: RED_LIGHT, label: "未覆盖 μ" },
              { color: ACCENT, bg: ACCENT_LIGHT, label: "真值 μ=0" },
            ].map(({ color, bg, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
                <span
                  className="inline-block h-2.5 w-5 rounded-sm flex-shrink-0"
                  style={{ background: bg, border: `1.5px solid ${color}` }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 进度条：覆盖率 vs 声称值 */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-[var(--ink-soft)]">
            <span style={{ color: GREEN }}>已覆盖 {covered} 次</span>
            <span style={{ color: RED }}>未覆盖 {total - covered} 次</span>
          </div>
          <div className="h-4 w-full rounded-full overflow-hidden flex" style={{ background: RED_LIGHT, border: `1px solid ${RED}` }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${empiricalRate * 100}%`,
                background: GREEN,
              }}
            />
            {/* 目标线 */}
          </div>
          {/* 目标指示 */}
          <div
            className="relative h-3"
            style={{ marginTop: -2 }}
          >
            <div
              className="absolute top-0 w-px h-3"
              style={{
                left: `${targetRate * 100}%`,
                background: ACCENT,
              }}
            />
            <div
              className="absolute top-2 text-[9px] font-mono font-bold"
              style={{
                left: `${targetRate * 100}%`,
                transform: "translateX(-50%)",
                color: ACCENT,
                whiteSpace: "nowrap",
              }}
            >
              目标 {pct(targetRate)}
            </div>
          </div>
        </div>
      )}

      {/* 说明面板 */}
      <div className="space-y-2">
        {/* 区间公式 */}
        <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-2">
          <div className="font-semibold text-[13px] text-[var(--ink)]">
            {useZ ? "Z 区间（σ = 1 已知）" : "t 区间（σ 未知，用 S 估计）"}
          </div>
          <div className="font-mono text-[12px]">
            {useZ
              ? `CI = [x̄ − z_{α/2}·σ/√n,  x̄ + z_{α/2}·σ/√n]`
              : `CI = [x̄ − t_{α/2,n−1}·S/√n,  x̄ + t_{α/2,n−1}·S/√n]`}
          </div>
          <div className="font-mono text-[11px] leading-loose">
            <span>α = 1 − {pct(confidenceLevel)} = {pct(alpha)}，</span>
            <span>
              {useZ ? "z" : "t"}
              <sub>{useZ ? "α/2" : `α/2,${n-1}`}</sub>
              {" = "}
              <b className="text-[var(--ink)]">{critVal.toFixed(4)}</b>
            </span>
            <span>，n = {n}</span>
          </div>
        </div>

        {/* 概念洞察 */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">核心直觉：</span>
          「95% 置信区间」的含义<b className="text-[var(--ink)]">不是</b>「μ 以 95% 的概率落在某个区间里」——
          μ 是固定的，区间是随机的。正确理解是：
          <b className="text-[var(--ink)]">反复抽样构造的区间，约有 {pct(confidenceLevel)} 覆盖真值 μ</b>。
          多次点击模拟，你会看到实际覆盖率收敛到 {pct(confidenceLevel)}。
          {!useZ && (
            <span className="block mt-1">
              <b className="text-[var(--ink)]">t 区间</b>：σ 未知时用样本标准差 S 代替，
              临界值换为 t 分位数（自由度 df=n−1）。n 较小时 t 分布比正态更胖尾，
              区间更宽——这正是对不确定性的保守补偿。
            </span>
          )}
          {useZ && (
            <span className="block mt-1">
              <b className="text-[var(--ink)]">Z 区间</b>：σ 已知时，标准误 σ/√n 是确定的，
              用标准正态分位数 z<sub>α/2</sub> 即可。n 越大，区间越窄，估计越精确。
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ConfidenceIntervalExplorerBase);