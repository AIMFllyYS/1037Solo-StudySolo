import type { TabType } from "@/lib/learning/probability/distributions/binomial";
import { ACCENT, ACCENT_LIGHT } from "./appearance";
// ─── 二项分布洞察块 ───────────────────────────────────────────────────────────
export function BinomInsight({ n, p, mean }: { n: number; p: number; mean: number }) {
  const isSymmetric = Math.abs(p - 0.5) < 0.05;
  const isLeftSkewed = p > 0.5;
  const isRightSkewed = p < 0.5;

  let shapeNote = "";
  if (isSymmetric) shapeNote = "p ≈ 0.5 时分布近似对称（钟形）。";
  else if (isLeftSkewed) shapeNote = "p > 0.5 时分布左偏（重心靠右），众数在均值右侧。";
  else if (isRightSkewed) shapeNote = "p < 0.5 时分布右偏（重心靠左），众数在均值左侧。";

  const largeN = n >= 20 && p >= 0.1 && p <= 0.9;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
      <span className="font-semibold text-[var(--ink)]">直觉：</span>
      <span>
        B({n}, {p.toFixed(2)}) 的均值为{" "}
        <b className="text-[var(--ink)]">{mean.toFixed(2)}</b>，即「平均成功次数」。
        {shapeNote && " " + shapeNote}
        {largeN && " n 较大且 p 适中时，二项分布近似正态分布（中心极限定理）。"}
      </span>
    </div>
  );
}

// ─── 泊松分布洞察块 ───────────────────────────────────────────────────────────
export function PoissonInsight({ lambda }: { lambda: number }) {
  const isSmall = lambda < 1;
  const isLarge = lambda > 8;

  let note = "";
  if (isSmall) {
    note = `λ 很小时，P(X=0) 很大——事件极少发生，绝大多数时间次数为 0。`;
  } else if (isLarge) {
    note = `λ 较大时，泊松分布趋近正态分布，形状越来越对称。`;
  } else {
    note = `泊松分布的均值与方差相等，都等于 λ——这是泊松分布的标志性性质。`;
  }

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
      <span className="font-semibold text-[var(--ink)]">直觉：</span>
      <span>
        {note} 泊松分布常用于「单位时间内随机事件发生次数」的建模（如呼叫中心来电、放射性衰变等）。
      </span>
    </div>
  );
}

// ─── 二项→泊松极限提示 ────────────────────────────────────────────────────────
export function BinomPoissonBridge({
  tab,
  n,
  p,
  lambda,
}: {
  tab: TabType;
  n: number;
  p: number;
  lambda: number;
}) {
  // 当 n 很大、p 很小，np ≈ λ 时，二项 ≈ 泊松
  const np = n * p;
  const isClose = tab === "binomial" && n >= 20 && p <= 0.1 && Math.abs(np - lambda) < 0.5;
  const isCloseToCurrentLambda = tab === "poisson" && n >= 20 && p <= 0.1 && Math.abs(np - lambda) < 0.5;

  if (!isClose && !isCloseToCurrentLambda) {
    return (
      <div
        className="rounded-lg border border-dashed border-[var(--line)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed"
      >
        <span className="font-semibold text-[var(--ink)]">极限定理：</span>
        当 n 很大、p 很小且 np = λ 保持不变时，
        <span className="font-mono"> B(n, p) → P(λ)</span>（泊松极限）。
        尝试设 n=30, p=0.1，再与 P(λ=3) 对比！
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-dashed px-3 py-2.5 text-[12px] leading-relaxed"
      style={{ borderColor: ACCENT, background: ACCENT_LIGHT, color: ACCENT }}
    >
      <span className="font-bold">极限定理验证中！</span>
      {" "}当前 np = {np.toFixed(2)}，接近泊松参数 λ={lambda.toFixed(1)}。
      切换到另一个 Tab，你会发现两张图形状几乎一致——这就是「泊松极限定理」的直观体现。
    </div>
  );
}