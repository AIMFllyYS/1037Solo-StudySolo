"use client";

import { memo, useState } from "react";
import { sampleStats, SIGMA, MU, fiveNum } from "@/lib/learning/probability/estimation/comparator";
import { ACCENT, GREEN, RED, ACCENT_LIGHT, GREEN_LIGHT, RED_LIGHT, ORANGE, SVG_W, SVG_H, PAD_L, PAD_T, PLOT_W, PLOT_H } from "./EstimatorComparator/appearance";
import { StatCard } from "./EstimatorComparator/controls";
import { YAxis, makeScale, BoxPlot } from "./EstimatorComparator/plot";
// ─── 主组件 ──────────────────────────────────────────────────────────────────
function EstimatorComparatorBase() {
  const [n, setN] = useState<number>(10);
  const [simCount] = useState<number>(2000);
  const [running, setRunning] = useState<boolean>(false);

  // 模拟结果
  const [xbarList, setXbarList] = useState<number[]>([]);
  const [s2List, setS2List] = useState<number[]>([]);
  const [sn2List, setSn2List] = useState<number[]>([]);

  // 已模拟时用于计算的 n（防止 n 改变后统计不一致）
  const [simulatedN, setSimulatedN] = useState<number | null>(null);

  function runSimulation() {
    setRunning(true);
    // 在事件处理函数内使用 Math.random()（通过 randNormal）
    const xbars: number[] = [];
    const s2s: number[] = [];
    const sn2s: number[] = [];
    for (let i = 0; i < simCount; i++) {
      const { xbar, s2, sn2 } = sampleStats(n);
      xbars.push(xbar);
      s2s.push(s2);
      sn2s.push(sn2);
    }
    setXbarList(xbars);
    setS2List(s2s);
    setSn2List(sn2s);
    setSimulatedN(n);
    setRunning(false);
  }

  function reset() {
    setXbarList([]);
    setS2List([]);
    setSn2List([]);
    setSimulatedN(null);
  }

  const hasData = xbarList.length > 0;

  // ── 统计汇总 ────────────────────────────────────────────────────────────────
  function arrMean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function arrStd(arr: number[], mean: number): number {
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  }

  const xbarMean  = hasData ? arrMean(xbarList)  : 0;
  const s2Mean    = hasData ? arrMean(s2List)     : 0;
  const sn2Mean   = hasData ? arrMean(sn2List)    : 0;
  const xbarStd   = hasData ? arrStd(xbarList, xbarMean)  : 0;
  const s2Std     = hasData ? arrStd(s2List, s2Mean)      : 0;
  const sn2Std    = hasData ? arrStd(sn2List, sn2Mean)    : 0;

  const trueVar   = SIGMA * SIGMA;   // σ² = 4
  const sn2Bias   = hasData ? sn2Mean - trueVar  : -(trueVar / (simulatedN ?? n));

  // 偏差绝对值
  const xbarBiasAbs  = hasData ? Math.abs(xbarMean - MU)       : 0;
  const s2BiasAbs    = hasData ? Math.abs(s2Mean   - trueVar)  : 0;
  const sn2BiasAbs   = hasData ? Math.abs(sn2Mean  - trueVar)  : 0;

  // 是否可视为无偏（偏差 < 0.05 * 真值）
  const xbarUnbiased = xbarBiasAbs < 0.05 * (Math.abs(MU) + 1);
  const s2Unbiased   = s2BiasAbs   < 0.05 * trueVar;
  const sn2Unbiased  = sn2BiasAbs  < 0.05 * trueVar;

  // ── 箱线图数据（X̄ 图） ────────────────────────────────────────────────────
  const xbarQ5 = hasData ? fiveNum(xbarList) : ([MU - 2, MU - 1, MU, MU + 1, MU + 2] as [number,number,number,number,number]);
  const s2Q5   = hasData ? fiveNum(s2List)   : ([0, trueVar * 0.6, trueVar, trueVar * 1.4, trueVar * 2.2] as [number,number,number,number,number]);
  const sn2Q5  = hasData ? fiveNum(sn2List)  : ([0, trueVar * 0.5, trueVar * 0.9, trueVar * 1.3, trueVar * 2] as [number,number,number,number,number]);

  // ── X̄ 图轴域 ─────────────────────────────────────────────────────────────
  const xbarPad = hasData ? xbarStd * 3.5 : SIGMA / Math.sqrt(n) * 3.5;
  const xbarMin = MU - Math.max(xbarPad, 0.5);
  const xbarMax = MU + Math.max(xbarPad, 0.5);

  // ── S²/Sn² 图轴域 ────────────────────────────────────────────────────────
  const varPad  = hasData ? Math.max(s2Std, sn2Std) * 3.5 : trueVar * 1.5;
  const varMin  = 0;
  const varMax  = trueVar + Math.max(varPad, trueVar * 0.8);

  // ── 刻度 ─────────────────────────────────────────────────────────────────
  function niceTicksAround(center: number, range: number, count: number): number[] {
    const step = (range * 2) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    const niceStep = Math.ceil(step / mag) * mag;
    const start = Math.ceil((center - range) / niceStep) * niceStep;
    const ticks: number[] = [];
    for (let t = start; t <= center + range + 1e-9; t += niceStep) {
      ticks.push(parseFloat(t.toFixed(8)));
    }
    return ticks;
  }

  const xbarTicks = niceTicksAround(MU, (xbarMax - xbarMin) / 2, 5);
  const varTicks  = niceTicksAround((varMin + varMax) / 2, (varMax - varMin) / 2, 5).filter(v => v >= 0);

  // ── 理论标准差（相合性说明） ───────────────────────────────────────────────
  const theoreticalXbarSE = SIGMA / Math.sqrt(n);  // → 0 as n→∞
  const theoreticalSn2Bias = -trueVar / n;          // → 0 as n→∞

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">

      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">估计量性质比较器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          总体 <span className="font-mono font-semibold text-[var(--ink)]">N(μ={MU}, σ²={trueVar})</span>，
          重复抽样 {simCount} 次，比较 <span style={{color:ACCENT}}>X̄</span>、
          <span style={{color:GREEN}}>S²（无偏）</span>、
          <span style={{color:RED}}>Sn²（有偏）</span> 的分布，验证无偏性与相合性。
        </p>
      </div>

      {/* 控制区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        {/* n 滑块 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              样本量 <span className="font-mono" style={{color:ACCENT}}>n = {n}</span>
            </span>
            <span className="text-[11px] text-[var(--ink-soft)]">
              理论 SE(X̄) = {theoreticalXbarSE.toFixed(4)}
              理论偏差(Sn²) = {theoreticalSn2Bias.toFixed(4)}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={n}
            onChange={(e) => {
              setN(Number(e.target.value));
              reset();
            }}
            className="w-full h-1.5 cursor-pointer"
            style={{ accentColor: ACCENT }}
          />
          <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
            <span>n=5（偏差明显）</span>
            <span>n=100（偏差消失）</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runSimulation}
            disabled={running}
            className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {running ? "模拟中…" : `▶ 模拟 ${simCount} 次`}
          </button>
          <button
            onClick={reset}
            disabled={!hasData}
            className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-[var(--ink-soft)] bg-[var(--bg-elevated)] border border-[var(--line)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
          >
            重置
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {hasData && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="X̄（样本均值）"
            value={xbarMean.toFixed(4)}
            sub={`真值 μ=${MU}　偏差 ${(xbarMean - MU > 0 ? "+" : "") + (xbarMean - MU).toFixed(4)}`}
            color={ACCENT}
            bg={ACCENT_LIGHT}
            badge={xbarUnbiased ? "无偏 [OK]" : "有偏 [X]"}
            badgeColor={xbarUnbiased ? GREEN : RED}
          />
          <StatCard
            label="S²（无偏方差）"
            value={s2Mean.toFixed(4)}
            sub={`真值 σ²=${trueVar}　偏差 ${(s2Mean - trueVar > 0 ? "+" : "") + (s2Mean - trueVar).toFixed(4)}`}
            color={GREEN}
            bg={GREEN_LIGHT}
            badge={s2Unbiased ? "无偏 [OK]" : "有偏 [X]"}
            badgeColor={s2Unbiased ? GREEN : RED}
          />
          <StatCard
            label="Sn²（有偏方差）"
            value={sn2Mean.toFixed(4)}
            sub={`真值 σ²=${trueVar}　偏差 ${(sn2Mean - trueVar > 0 ? "+" : "") + (sn2Mean - trueVar).toFixed(4)}`}
            color={RED}
            bg={RED_LIGHT}
            badge={sn2Unbiased ? "近似无偏" : `有偏 [X]（−${trueVar}/n）`}
            badgeColor={sn2Unbiased ? GREEN : ORANGE}
          />
        </div>
      )}

      {/* 箱线图：X̄ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-bold" style={{color:ACCENT}}>① X̄ 的抽样分布</span>
          <span className="text-[11px] text-[var(--ink-soft)]">
            估计 μ={MU}
            {hasData ? `实测均值 = ${xbarMean.toFixed(4)}，SE = ${xbarStd.toFixed(4)}` : "（点击「模拟」后显示）"}
          </span>
        </div>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg border border-[var(--line)]">
          {/* 底色 */}
          <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" />
          <YAxis vMin={xbarMin} vMax={xbarMax} ticks={xbarTicks} label="X̄" />
          {/* 真实 μ 红虚线 */}
          {(() => {
            const sc = makeScale(xbarMin, xbarMax);
            const yMu = sc.y(MU);
            return (
              <>
                <line x1={PAD_L} y1={yMu} x2={PAD_L + PLOT_W} y2={yMu} stroke={RED} strokeWidth={1.8} strokeDasharray="6 3" />
                <text x={PAD_L + PLOT_W - 2} y={yMu - 4} fontSize={10} textAnchor="end" fill={RED}>μ = {MU}</text>
              </>
            );
          })()}
          {hasData && (
            <BoxPlot
              data={{
                label: "X̄",
                color: ACCENT,
                q5: xbarQ5,
                mean: xbarMean,
                trueVal: MU,
                biasLabel: xbarUnbiased ? "无偏" : "有偏",
                biasColor: xbarUnbiased ? GREEN : RED,
              }}
              vMin={xbarMin}
              vMax={xbarMax}
              cx={0.5}
              halfW={0.18}
            />
          )}
          {!hasData && (
            <text x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H / 2 + 4} fontSize={13} textAnchor="middle" fill="var(--ink-faint)">
              点击「模拟 {simCount} 次」开始
            </text>
          )}
          {/* 图例 */}
          {hasData && (() => {
            const lx = PAD_L + 12;
            const ly = PAD_T + 12;
            return (
              <g>
                <rect x={lx} y={ly - 8} width={100} height={26} rx={4} fill="var(--bg-elevated)" opacity={0.85} />
                <line x1={lx + 6} y1={ly} x2={lx + 22} y2={ly} stroke={RED} strokeWidth={1.8} strokeDasharray="5 3" />
                <text x={lx + 26} y={ly + 3.5} fontSize={10} fill={RED}>真实 μ</text>
                <polygon points={`${lx + 60},${ly} ${lx + 64},${ly + 5} ${lx + 60},${ly + 10} ${lx + 56},${ly + 5}`}
                  fill={ACCENT} opacity={0.85} />
                <text x={lx + 68} y={ly + 3.5} fontSize={10} fill={ACCENT}>均值</text>
                <line x1={lx + 56} y1={ly + 14} x2={lx + 66} y2={ly + 14} stroke={ACCENT} strokeWidth={2.5} />
                <text x={lx + 68} y={ly + 17.5} fontSize={10} fill={ACCENT}>中位数</text>
              </g>
            );
          })()}
        </svg>
        {hasData && (
          <div className="mt-1 px-1 text-[11px] text-[var(--ink-soft)]">
            X̄ 的期望 E[X̄] = μ，故 X̄ 是 μ 的<b className={`ml-0.5`} style={{color: xbarUnbiased ? GREEN : RED}}>
              {xbarUnbiased ? "无偏估计量" : "（本次偶然偏差过大）"}
            </b>。
            方差 D[X̄] = σ²/n = {(trueVar / n).toFixed(4)}，n 越大分布越集中（相合性）。
          </div>
        )}
      </div>

      {/* 箱线图：S² 和 Sn² 并列 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-bold" style={{color:GREEN}}>② S²</span>
          <span className="text-[13px] font-bold" style={{color:RED}}>vs Sn²</span>
          <span className="text-[11px] text-[var(--ink-soft)]">
            估计 σ²={trueVar}　橙色括号 = 偏差大小
          </span>
        </div>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-lg border border-[var(--line)]">
          <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="var(--bg-muted)" />
          <YAxis vMin={varMin} vMax={varMax} ticks={varTicks} label="方差" />
          {/* 真实 σ² 红虚线 */}
          {(() => {
            const sc = makeScale(varMin, varMax);
            const yV = sc.y(trueVar);
            return (
              <>
                <line x1={PAD_L} y1={yV} x2={PAD_L + PLOT_W} y2={yV} stroke={RED} strokeWidth={1.8} strokeDasharray="6 3" />
                <text x={PAD_L + PLOT_W - 2} y={yV - 4} fontSize={10} textAnchor="end" fill={RED}>σ² = {trueVar}</text>
              </>
            );
          })()}
          {hasData && (
            <>
              <BoxPlot
                data={{
                  label: "S²",
                  color: GREEN,
                  q5: s2Q5,
                  mean: s2Mean,
                  trueVal: trueVar,
                  biasLabel: "无偏",
                  biasColor: GREEN,
                }}
                vMin={varMin}
                vMax={varMax}
                cx={0.3}
                halfW={0.18}
              />
              <BoxPlot
                data={{
                  label: "Sn²",
                  color: RED,
                  q5: sn2Q5,
                  mean: sn2Mean,
                  trueVal: trueVar,
                  biasLabel: "有偏",
                  biasColor: RED,
                }}
                vMin={varMin}
                vMax={varMax}
                cx={0.72}
                halfW={0.18}
              />
              {/* 列标签 */}
              {(() => {
                const sc = makeScale(varMin, varMax);
                const labelY = PAD_T + PLOT_H + 16;
                return (
                  <g>
                    <text x={sc.x(0.3)} y={labelY} fontSize={12} textAnchor="middle" fontWeight="700" fill={GREEN}>S²</text>
                    <text x={sc.x(0.3) + 2} y={labelY + 11} fontSize={9} textAnchor="middle" fill="var(--ink-faint)">无偏方差</text>
                    <text x={sc.x(0.72)} y={labelY} fontSize={12} textAnchor="middle" fontWeight="700" fill={RED}>Sn²</text>
                    <text x={sc.x(0.72)} y={labelY + 11} fontSize={9} textAnchor="middle" fill="var(--ink-faint)">有偏方差</text>
                  </g>
                );
              })()}
            </>
          )}
          {!hasData && (
            <text x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H / 2 + 4} fontSize={13} textAnchor="middle" fill="var(--ink-faint)">
              点击「模拟 {simCount} 次」开始
            </text>
          )}
        </svg>
      </div>

      {/* 相合性说明：偏差随 n 变化的数值提示 */}
      {hasData && (
        <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 text-[12px] leading-relaxed text-[var(--ink-soft)] space-y-2">
          <div className="font-semibold text-[13px] text-[var(--ink)]">核心结论（当前 n = {simulatedN}）</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <div>
              <span className="font-semibold" style={{color:ACCENT}}>X̄</span>：
              E[X̄] = μ = {MU}（无偏），D[X̄] = σ²/n = {(trueVar/n).toFixed(4)} → 0，<b>相合</b>
            </div>
            <div>
              <span className="font-semibold" style={{color:GREEN}}>S²</span>：
              E[S²] = σ² = {trueVar}（无偏），<b>相合</b>；
              分母 (n−1) 修正了自由度损失
            </div>
            <div>
              <span className="font-semibold" style={{color:RED}}>Sn²</span>：
              E[Sn²] = (n−1)/n · σ² = {((n-1)/n * trueVar).toFixed(4)}，
              <b style={{color:ORANGE}}>系统低估 {Math.abs(sn2Bias).toFixed(4)}</b>
              {Math.abs(sn2Bias) < 0.05 * trueVar
                ? "（n 已较大，偏差趋近消失 → 相合）"
                : `（偏差 = −σ²/n = −${(trueVar/n).toFixed(4)}）`}
            </div>
            <div style={{borderLeft: `3px solid ${ORANGE}`, paddingLeft: 8}}>
              <b>相合性：</b>n↑ → 偏差 |σ²/n| → 0，
              故 Sn² 仍是 σ² 的相合估计量，但不是无偏估计量。
              拖动 n 滑块可直观观察 Sn² 箱体向 σ²={trueVar} 靠拢的过程。
            </div>
          </div>
        </div>
      )}

      {/* 图例说明 */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[var(--ink-soft)]">
        <div className="flex items-center gap-1.5">
          <svg width="28" height="12">
            <line x1={0} y1={6} x2={28} y2={6} stroke={RED} strokeWidth={1.8} strokeDasharray="5 3" />
          </svg>
          <span>真实参数值</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12">
            <polygon points="6,0 11,6 6,12 1,6" fill={ACCENT} opacity={0.85} />
          </svg>
          <span>样本均值</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12">
            <line x1={0} y1={6} x2={24} y2={6} stroke={ACCENT} strokeWidth={2.5} />
          </svg>
          <span>中位数</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="12">
            <line x1={8} y1={0} x2={8} y2={12} stroke={ORANGE} strokeWidth={1.5} />
            <line x1={4} y1={0} x2={12} y2={0} stroke={ORANGE} strokeWidth={1.5} />
            <line x1={4} y1={12} x2={12} y2={12} stroke={ORANGE} strokeWidth={1.5} />
          </svg>
          <span style={{color:ORANGE}}>偏差大小</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12">
            <rect x={0} y={2} width={24} height={8} fill={ACCENT + "28"} stroke={ACCENT} strokeWidth={1.5} rx={2} />
          </svg>
          <span>四分位箱（IQR）</span>
        </div>
      </div>
    </div>
  );
}

export default memo(EstimatorComparatorBase);