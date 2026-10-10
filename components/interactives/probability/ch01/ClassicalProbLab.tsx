"use client";

import { memo, useState } from "react";
import { simulateDice, simulateBalls, diceOutcomes, ballsOutcomes } from "@/lib/learning/probability/foundations/classical";
import type { SceneKey, SceneDef } from "@/lib/learning/probability/foundations/classical";
import { CHART_W, PAD_T, CHART_H, PAD_L, SVG_W, SVG_H, PAD_R } from "./ClassicalProbLab/appearance";
// ─── 主组件 ──────────────────────────────────────────────────────────────────

function ClassicalProbLabBase() {
  // 场景选择
  const [scene, setScene] = useState<SceneKey>("dice");

  // 骰子参数：目标和
  const [targetSum, setTargetSum] = useState(7);

  // 摸球参数
  const [ballTotal, setBallTotal] = useState(10);
  const [ballRed, setBallRed] = useState(3);

  // 模拟
  const [runs, setRuns] = useState(200);
  const [simHits, setSimHits] = useState<number | null>(null);
  const [simTotal, setSimTotal] = useState<number>(0);

  // 折线历史（频率收敛曲线）最多 300 点
  const [history, setHistory] = useState<number[]>([]);

  function runSim() {
    const n = runs;
    let hits: number;
    if (scene === "dice") {
      hits = simulateDice(n, targetSum);
    } else {
      const k = Math.min(ballRed, ballTotal);
      hits = simulateBalls(n, ballTotal, k);
    }
    const newTotal = simTotal + n;
    const newHits = (simHits ?? 0) + hits;
    setSimHits(newHits);
    setSimTotal(newTotal);

    // 累积频率历史（取最后的频率）
    setHistory((prev) => {
      const next = [...prev, newHits / newTotal];
      return next.length > 300 ? next.slice(next.length - 300) : next;
    });
  }

  function reset() {
    setSimHits(null);
    setSimTotal(0);
    setHistory([]);
  }

  // 计算当前场景定义
  const sceneDef: SceneDef =
    scene === "dice"
      ? diceOutcomes(targetSum)
      : ballsOutcomes(ballTotal, Math.min(ballRed, ballTotal));

  // 理论概率
  const theoryGroup = sceneDef.outcomes.find(
    (o) => o.color === "#5b46e5"
  )!;
  const theoryProb = theoryGroup.count / theoryGroup.total;

  // 频率
  const freqProb = simTotal > 0 ? (simHits ?? 0) / simTotal : null;

  // ─── 柱状图绘制 ──────────────────────────────────────────────────────────────

  const outLen = sceneDef.outcomes.length;
  const barW = Math.min(36, (CHART_W / outLen) * 0.55);
  const gap = CHART_W / outLen;

  // ─── 折线图绘制 ──────────────────────────────────────────────────────────────

  const maxY = 1;
  const yScale = (v: number) => PAD_T + (1 - v / maxY) * CHART_H;
  const xScale = (i: number) =>
    PAD_L + (history.length <= 1 ? 0 : (i / (history.length - 1)) * CHART_W);

  const linePath =
    history.length > 1
      ? history
          .map(
            (v, i) =>
              `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`
          )
          .join(" ")
      : "";

  const theoryY = yScale(theoryProb);

  // ─── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">

      {/* 标题行 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">
          古典概型实验室
        </h3>
        <div className="flex gap-1.5">
          {(["dice", "balls"] as SceneKey[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setScene(k);
                reset();
              }}
              className={
                "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors " +
                (scene === k
                  ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak)]")
              }
            >
              {k === "dice" ? "骰子之和" : "摸球"}
            </button>
          ))}
        </div>
      </div>

      {/* 场景描述 */}
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {sceneDef.description}
      </p>

      {/* 参数控制区 */}
      <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2">
        {scene === "dice" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-medium text-[var(--ink-soft)]">
              目标和：
            </span>
            <input
              type="range"
              min={2}
              max={12}
              value={targetSum}
              onChange={(e) => {
                setTargetSum(Number(e.target.value));
                reset();
              }}
              className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
              style={{ minWidth: 80 }}
            />
            <span className="w-5 text-center text-[13px] font-bold text-[var(--ink)]">
              {targetSum}
            </span>
            <span className="text-[12px] text-[var(--ink-soft)]">
              理论概率&nbsp;
              <b className="font-mono text-[var(--accent)]">
                {theoryGroup.count}/36 ≈ {theoryProb.toFixed(4)}
              </b>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[12px] font-medium text-[var(--ink-soft)]">
              总球数&nbsp;
              <input
                type="range"
                min={2}
                max={20}
                value={ballTotal}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setBallTotal(n);
                  if (ballRed > n) setBallRed(n);
                  reset();
                }}
                className="mx-1.5 h-1.5 w-20 cursor-pointer accent-[var(--accent)]"
              />
              <b className="text-[var(--ink)]">{ballTotal}</b>
            </label>
            <label className="text-[12px] font-medium text-[var(--ink-soft)]">
              红球数&nbsp;
              <input
                type="range"
                min={0}
                max={ballTotal}
                value={ballRed}
                onChange={(e) => {
                  setBallRed(Number(e.target.value));
                  reset();
                }}
                className="mx-1.5 h-1.5 w-20 cursor-pointer accent-[var(--accent)]"
              />
              <b className="text-[var(--ink)]">{ballRed}</b>
            </label>
            <span className="text-[12px] text-[var(--ink-soft)]">
              理论概率&nbsp;
              <b className="font-mono text-[var(--accent)]">
                {ballRed}/{ballTotal} ≈ {theoryProb.toFixed(4)}
              </b>
            </span>
          </div>
        )}
      </div>

      {/* 两栏：柱状图 + 收敛曲线 */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* 柱状图：理论频率 */}
        <div>
          <p className="mb-1 text-[11px] text-[var(--ink-soft)]">
            理论概率分布（各结果占比）
          </p>
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg bg-[var(--bg-muted)]">
            {/* y 轴 */}
            <line
              x1={PAD_L}
              y1={PAD_T}
              x2={PAD_L}
              y2={PAD_T + CHART_H}
              stroke="var(--line)"
              strokeWidth={1}
            />
            {/* x 轴 */}
            <line
              x1={PAD_L}
              y1={PAD_T + CHART_H}
              x2={SVG_W - PAD_R}
              y2={PAD_T + CHART_H}
              stroke="var(--line)"
              strokeWidth={1}
            />
            {/* y 刻度 */}
            {[0, 0.1, 0.2, 0.3].map((v) => {
              const yy = PAD_T + CHART_H - v * CHART_H * (scene === "dice" ? 3.33 : 1);
              if (yy < PAD_T) return null;
              return (
                <g key={v}>
                  <line x1={PAD_L - 3} y1={yy} x2={PAD_L} y2={yy} stroke="var(--line)" />
                  <text
                    x={PAD_L - 5}
                    y={yy + 3}
                    fontSize={8}
                    textAnchor="end"
                    fill="var(--ink-faint)"
                  >
                    {v.toFixed(1)}
                  </text>
                </g>
              );
            })}
            {/* 柱子 */}
            {sceneDef.outcomes.map((o, i) => {
              const prob = o.count / o.total;
              const barH = prob * CHART_H * (scene === "dice" ? 3.33 : 1);
              const cx = PAD_L + gap * i + gap / 2;
              return (
                <g key={o.label}>
                  <rect
                    x={cx - barW / 2}
                    y={PAD_T + CHART_H - barH}
                    width={barW}
                    height={barH}
                    rx={3}
                    fill={o.color}
                    opacity={0.85}
                  />
                  <text
                    x={cx}
                    y={PAD_T + CHART_H + 12}
                    fontSize={scene === "dice" ? 7.5 : 10}
                    textAnchor="middle"
                    fill="var(--ink-faint)"
                  >
                    {o.label}
                  </text>
                  {/* 频率标注（只对有利事件） */}
                  {o.color === "#5b46e5" && (
                    <text
                      x={cx}
                      y={PAD_T + CHART_H - barH - 4}
                      fontSize={8}
                      textAnchor="middle"
                      fill="#5b46e5"
                      fontWeight="700"
                    >
                      {(prob * 100).toFixed(1)}%
                    </text>
                  )}
                </g>
              );
            })}
            {/* 标题 */}
            <text
              x={PAD_L + CHART_W / 2}
              y={PAD_T - 3}
              fontSize={9}
              textAnchor="middle"
              fill="var(--ink-faint)"
            >
              {sceneDef.name} — 理论分布
            </text>
          </svg>
        </div>

        {/* 折线图：频率收敛曲线 */}
        <div>
          <p className="mb-1 text-[11px] text-[var(--ink-soft)]">
            频率收敛曲线（{sceneDef.targetLabel}）
          </p>
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg bg-[var(--bg-muted)]">
            {/* 背景格 */}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={CHART_W}
              height={CHART_H}
              fill="var(--bg-muted)"
              stroke="var(--line)"
            />
            {/* 理论线 */}
            <line
              x1={PAD_L}
              y1={theoryY}
              x2={PAD_L + CHART_W}
              y2={theoryY}
              stroke="#5b46e5"
              strokeWidth={1.2}
              strokeDasharray="5 3"
              opacity={0.7}
            />
            <text
              x={PAD_L + CHART_W - 2}
              y={theoryY - 4}
              fontSize={8}
              textAnchor="end"
              fill="#5b46e5"
            >
              理论 {theoryProb.toFixed(3)}
            </text>
            {/* y 刻度 0/0.5/1 */}
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line
                  x1={PAD_L - 3}
                  y1={yScale(v)}
                  x2={PAD_L}
                  y2={yScale(v)}
                  stroke="var(--line)"
                />
                <text
                  x={PAD_L - 5}
                  y={yScale(v) + 3}
                  fontSize={8}
                  textAnchor="end"
                  fill="var(--ink-faint)"
                >
                  {v}
                </text>
              </g>
            ))}
            {/* 收敛折线 */}
            {linePath && (
              <path d={linePath} fill="none" stroke="#5b46e5" strokeWidth={1.8} />
            )}
            {history.length === 0 && (
              <text
                x={PAD_L + CHART_W / 2}
                y={PAD_T + CHART_H / 2}
                fontSize={11}
                textAnchor="middle"
                fill="#c4b5fd"
              >
                按下「运行」开始模拟
              </text>
            )}
            {/* 当前频率点 */}
            {history.length > 0 && (
              <circle
                cx={xScale(history.length - 1)}
                cy={yScale(history[history.length - 1])}
                r={3.5}
                fill="#5b46e5"
              />
            )}
          </svg>
        </div>
      </div>

      {/* 统计数字卡片 */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-lg bg-[var(--bg-muted)] px-2 py-2">
          <div className="text-[var(--ink-soft)]">有利 / 总数</div>
          <div className="font-mono font-bold text-[var(--ink)]">
            {theoryGroup.count} / {theoryGroup.total}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-muted)] px-2 py-2">
          <div className="text-[var(--ink-soft)]">理论概率</div>
          <div className="font-mono font-bold text-[var(--accent)]">
            {theoryProb.toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-muted)] px-2 py-2">
          <div className="text-[var(--ink-soft)]">
            试验频率
            {simTotal > 0 && (
              <span className="ml-1 text-[10px]">({simTotal}次)</span>
            )}
          </div>
          <div
            className={
              "font-mono font-bold " +
              (freqProb === null
                ? "text-[var(--ink-soft)]"
                : Math.abs(freqProb - theoryProb) < 0.02
                ? "text-[var(--color-success)]"
                : "text-[var(--color-warning)]")
            }
          >
            {freqProb !== null ? freqProb.toFixed(4) : "—"}
          </div>
        </div>
      </div>

      {/* 误差指示器 */}
      {freqProb !== null && (
        <div className="mb-3 rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-[12px]">
          <span className="text-[var(--ink-soft)]">|频率 − 理论概率|&nbsp;=&nbsp;</span>
          <span
            className={
              "font-mono font-bold " +
              (Math.abs(freqProb - theoryProb) < 0.01
                ? "text-[var(--color-success)]"
                : Math.abs(freqProb - theoryProb) < 0.05
                ? "text-[var(--color-warning)]"
                : "text-[var(--md-sys-color-error)]")
            }
          >
            {Math.abs(freqProb - theoryProb).toFixed(4)}
          </span>
          <span className="ml-2 text-[var(--ink-soft)]">
            {Math.abs(freqProb - theoryProb) < 0.01
              ? "[OK] 非常接近，大数定律在起作用！"
              : Math.abs(freqProb - theoryProb) < 0.05
              ? "↗ 继续增加试验次数，误差会缩小"
              : "→ 试验次数较少，误差较大，请继续运行"}
          </span>
        </div>
      )}

      {/* 操作按钮行 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 试验次数滑块 */}
        <div className="flex flex-1 items-center gap-2 text-[12px] text-[var(--ink-soft)]">
          <span className="shrink-0">每次运行：</span>
          <input
            type="range"
            min={10}
            max={5000}
            step={10}
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
            style={{ minWidth: 60 }}
          />
          <span className="w-14 text-right font-mono font-bold text-[var(--ink)]">
            {runs.toLocaleString()}
          </span>
        </div>
        <button
          onClick={runSim}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--md-sys-color-on-primary)] hover:opacity-90 active:scale-95 transition-transform"
        >
          运行
        </button>
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--line)] transition-colors"
        >
          重置
        </button>
      </div>

      {/* 底部说明 */}
      <p className="mt-3 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
        <span className="font-semibold text-[var(--ink)]">古典概型要点</span>：样本空间有限且每个基本事件{" "}
        <b>等可能</b>发生，有利事件的概率 = 有利结果数 ÷ 总结果数。多次重复试验后，
        频率会稳定收敛到理论概率（大数定律）。调整参数或切换场景，感受等可能结构的普适性。
      </p>
    </div>
  );
}

export default memo(ClassicalProbLabBase);