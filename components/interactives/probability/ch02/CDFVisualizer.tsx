"use client";

import { memo, useState } from "react";
import type { DistType } from "@/lib/learning/probability/cumulativeDistributions";
import { ACCENT, BG_MUTED, ORANGE, GREEN, ACCENT_LIGHT, INK } from "./CDFVisualizer/appearance";

import { fmt4 } from "./CDFVisualizer/formatters";
import { CDFPlot } from './CDFVisualizer/CDFPlot';
import { useCdfScene } from './CDFVisualizer/useCdfScene';
function CDFVisualizerBase() {
  // 分布选择
  const [distType, setDistType] = useState<DistType>("binomial");
  // 二项参数
  const [binomN] = useState(10);
  const [binomP, setBinomP] = useState(0.4);
  // 正态参数
  const [normalMu, setNormalMu] = useState(0);
  const [normalSigma, setNormalSigma] = useState(1);
  // 指数参数
  const [expLambda, setExpLambda] = useState(1);

  // 单滑块 x（用于 F(x) 计算）
  const [xVal, setXVal] = useState<number>(4);

  // 双滑块 a, b（用于区间概率 P(a<=X<=b)）
  const [aVal, setAVal] = useState<number>(2);
  const [bVal, setBVal] = useState<number>(6);

  // 是否显示区间模式
  const [showInterval, setShowInterval] = useState(false);

  // 视图模式：PDF/PMF 还是 CDF
  const [viewMode, setViewMode] = useState<"pdf" | "cdf">("pdf");
  const scene = useCdfScene({ distType, binomN, normalMu, normalSigma, expLambda, binomP, setXVal, setAVal, setBVal, setDistType, xVal, aVal, bVal, showInterval, viewMode });
  const { switchDist, fxVal, intervalProb, loAB, getCDF, hiAB, distName } = scene;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">分布函数 F(x) 可视化</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          拖动竖线，直观理解 F(x) = P(X ≤ x) 的含义；切换分布观察形态变化。
        </p>
      </div>

      {/* ── 分布选择 ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[12px] font-semibold text-[var(--ink-soft)]">分布：</span>
        {(
          [
            { key: "binomial", label: "离散 B(10, p)" },
            { key: "normal", label: "连续 N(μ, σ²)" },
            { key: "exponential", label: "连续 Exp(λ)" },
          ] as { key: DistType; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchDist(key)}
            className={
              "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
              (distType === key
                ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak)]")
            }
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          {(["pdf", "cdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors " +
                (viewMode === m
                  ? "bg-[var(--ink)] text-[var(--bg-elevated)]"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)]")
              }
            >
              {m === "pdf" ? (distType === "binomial" ? "PMF" : "PDF") : "CDF"}
            </button>
          ))}
        </div>
      </div>

      {/* ── 参数控制 ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-[var(--bg-muted)] px-4 py-2.5 text-[12px]">
        {distType === "binomial" && (
          <label className="flex items-center gap-2 text-[var(--ink-soft)]">
            <span>p =</span>
            <input
              type="range" min={0.05} max={0.95} step={0.05}
              value={binomP}
              onChange={(e) => setBinomP(Number(e.target.value))}
              className="w-24 cursor-pointer"
              style={{ accentColor: ACCENT }}
            />
            <b className="font-mono text-[var(--ink)]">{binomP.toFixed(2)}</b>
          </label>
        )}
        {distType === "normal" && (
          <>
            <label className="flex items-center gap-2 text-[var(--ink-soft)]">
              <span>μ =</span>
              <input
                type="range" min={-3} max={3} step={0.5}
                value={normalMu}
                onChange={(e) => { setNormalMu(Number(e.target.value)); setXVal(Number(e.target.value)); }}
                className="w-20 cursor-pointer"
                style={{ accentColor: ACCENT }}
              />
              <b className="font-mono text-[var(--ink)]">{normalMu.toFixed(1)}</b>
            </label>
            <label className="flex items-center gap-2 text-[var(--ink-soft)]">
              <span>σ =</span>
              <input
                type="range" min={0.5} max={3} step={0.25}
                value={normalSigma}
                onChange={(e) => setNormalSigma(Number(e.target.value))}
                className="w-20 cursor-pointer"
                style={{ accentColor: ACCENT }}
              />
              <b className="font-mono text-[var(--ink)]">{normalSigma.toFixed(2)}</b>
            </label>
          </>
        )}
        {distType === "exponential" && (
          <label className="flex items-center gap-2 text-[var(--ink-soft)]">
            <span>λ =</span>
            <input
              type="range" min={0.25} max={3} step={0.25}
              value={expLambda}
              onChange={(e) => setExpLambda(Number(e.target.value))}
              className="w-20 cursor-pointer"
              style={{ accentColor: ACCENT }}
            />
            <b className="font-mono text-[var(--ink)]">{expLambda.toFixed(2)}</b>
          </label>
        )}
        <label className="flex items-center gap-2 text-[var(--ink-soft)]">
          <span>区间模式</span>
          <button
            onClick={() => setShowInterval((v) => !v)}
            className={
              "relative inline-flex h-5 w-9 rounded-full transition-colors " +
              (showInterval ? "bg-[var(--accent)]" : "bg-[var(--line)]")
            }
          >
            <span
              className={
                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " +
                (showInterval ? "translate-x-4" : "translate-x-0")
              }
            />
          </button>
        </label>
      </div>

      {/* ── SVG 主图 ─────────────────────────────────────────── */}
      <CDFPlot scene={scene} />

      {/* ── 结果展示面板 ─────────────────────────────────────── */}
      {!showInterval ? (
        /* 单滑块：F(x) 面板 */
        <div
          className="rounded-lg border-2 p-4 space-y-2"
          style={{ borderColor: ACCENT, background: ACCENT_LIGHT }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[13px] font-bold text-[var(--ink)]">
              F(x) = P(X ≤ x)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--ink-soft)]">
                x =
              </span>
              <span className="rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-[13px] font-mono font-bold" style={{ color: ACCENT }}>
                {distType === "binomial" ? xVal.toFixed(0) : xVal.toFixed(3)}
              </span>
              <span className="text-[18px] font-mono text-[var(--ink-soft)]">→</span>
              <span className="rounded-md bg-[var(--bg-elevated)] px-3 py-0.5 text-[18px] font-mono font-extrabold" style={{ color: ACCENT }}>
                {fmt4(fxVal)}
              </span>
            </div>
          </div>
          <p className="text-[12px] text-[var(--ink-soft)] leading-relaxed">
            {distType === "binomial" ? (
              <>
                P(X ≤ {Math.floor(xVal)}) = 累加 P(X=0) + P(X=1) + … + P(X={Math.floor(xVal)})，
                即左侧蓝色柱子概率之和 = <b style={{ color: ACCENT }}>{fmt4(fxVal)}</b>
              </>
            ) : (
              <>
                左侧阴影面积 =
                {distType === "normal" ? ` ∫₋∞^{${xVal.toFixed(2)}} f(t) dt` : ` ∫₀^{${xVal.toFixed(2)}} f(t) dt`}
                {" = "}<b style={{ color: ACCENT }}>{fmt4(fxVal)}</b>
              </>
            )}
          </p>
          {/* 进度条 */}
          <div className="h-4 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden border border-[var(--line)]">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${fxVal * 100}%`, background: ACCENT }}
            />
          </div>
          <div className="text-center text-[11px] text-[var(--ink-soft)]">
            累积概率 {(fxVal * 100).toFixed(2)}%
          </div>
        </div>
      ) : (
        /* 区间模式：P(a≤X≤b) 面板 */
        <div
          className="rounded-lg border-2 p-4 space-y-2"
          style={{ borderColor: ORANGE, background: `${ORANGE}15` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[13px] font-bold text-[var(--ink)]">
              P({distType === "binomial" ? "a≤X≤b" : "a≤X≤b"}) = F(b) − F(a{distType === "binomial" ? "−" : ""})
            </span>
            <span className="rounded-md bg-[var(--bg-elevated)] px-3 py-0.5 text-[18px] font-mono font-extrabold" style={{ color: ORANGE }}>
              {fmt4(intervalProb)}
            </span>
          </div>
          {/* a, b 数值 */}
          <div className="flex gap-4 flex-wrap text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: GREEN }} />
              <span className="text-[var(--ink-soft)]">a =</span>
              <b className="font-mono" style={{ color: GREEN }}>{distType === "binomial" ? loAB.toFixed(0) : loAB.toFixed(3)}</b>
              <span className="text-[var(--ink-soft)]"> → F(a) =</span>
              <b className="font-mono" style={{ color: GREEN }}>{fmt4(getCDF(loAB))}</b>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: ORANGE }} />
              <span className="text-[var(--ink-soft)]">b =</span>
              <b className="font-mono" style={{ color: ORANGE }}>{distType === "binomial" ? hiAB.toFixed(0) : hiAB.toFixed(3)}</b>
              <span className="text-[var(--ink-soft)]"> → F(b) =</span>
              <b className="font-mono" style={{ color: ORANGE }}>{fmt4(getCDF(hiAB))}</b>
            </div>
          </div>
          <p className="text-[12px] text-[var(--ink-soft)]">
            P(a≤X≤b) = F(b) − F(a{distType === "binomial" ? "⁻" : ""}) ={" "}
            <b style={{ color: ORANGE }}>{fmt4(getCDF(hiAB))}</b>{" "}−{" "}
            <b style={{ color: GREEN }}>{fmt4(getCDF(loAB))}</b>{" "}={" "}
            <b style={{ color: ORANGE }}>{fmt4(intervalProb)}</b>
          </p>
          {/* 进度条 */}
          <div className="h-4 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden border border-[var(--line)]">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${intervalProb * 100}%`, background: ORANGE }}
            />
          </div>
          <div className="text-center text-[11px] text-[var(--ink-soft)]">
            区间概率 {(intervalProb * 100).toFixed(2)}%
          </div>
        </div>
      )}

      {/* ── 关键性质说明 ─────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">分布函数的核心性质：</span>
        <span className="ml-1">
          ① F(−∞)=0，F(+∞)=1；② F(x) 单调不减；③ 右连续 F(x⁺)=F(x)；
          {distType === "binomial"
            ? " 离散型在整数处有跳跃，P(X=k)=F(k)−F(k−1)。"
            : " 连续型 P(X=x)=0，F(x)=∫f(t)dt，区间概率=面积差。"}
        </span>
        <span className="ml-1 block mt-1">
          {viewMode === "pdf"
            ? "拖动竖线观察左侧阴影面积（即 F(x)）实时变化；开启「区间模式」可计算 P(a≤X≤b)。"
            : "切换到 CDF 视图可看到 F(x) 曲线，交叉点的纵坐标即为累积概率值。"}
        </span>
      </div>

      {/* ── 数据摘要卡片 ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
        {[
          {
            label: "分布",
            val: distName,
            color: ACCENT,
            bg: ACCENT_LIGHT,
          },
          {
            label: "F(x) 值",
            val: fmt4(fxVal),
            color: ACCENT,
            bg: ACCENT_LIGHT,
          },
          {
            label: "1 − F(x)",
            val: fmt4(1 - fxVal),
            color: INK,
            bg: BG_MUTED,
          },
          {
            label: showInterval ? "区间概率" : "当前 x",
            val: showInterval
              ? fmt4(intervalProb)
              : (distType === "binomial" ? Math.floor(xVal).toFixed(0) : xVal.toFixed(3)),
            color: showInterval ? ORANGE : GREEN,
            bg: showInterval ? `${ORANGE}15` : `${GREEN}15`,
          },
        ].map(({ label, val, color, bg }) => (
          <div key={label} className="rounded-lg p-2.5" style={{ background: bg }}>
            <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
            <div className="text-[14px] font-extrabold font-mono mt-0.5" style={{ color }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default memo(CDFVisualizerBase);
