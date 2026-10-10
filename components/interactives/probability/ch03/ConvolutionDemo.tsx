"use client";

import { memo, useState } from "react";
import { DIST_CONFIGS, sampleDist, buildHistogram, hasAnalyticConvPDF } from "@/lib/learning/probability/joint/convolution";
import type { DistParams } from "@/lib/learning/probability/joint/convolution";
import { N_SAMPLES, N_BINS, TEAL, ACCENT, ORANGE, H, GRAY_BG, GRAY_LINE } from "./ConvolutionDemo/appearance";
import { DistPanel } from "./ConvolutionDemo/controls";
import { HistogramSVG } from "./ConvolutionDemo/plot";
function ConvolutionDemoBase() {
  const [xDist, setXDist] = useState<DistParams>({ type: "normal", p1: 0, p2: 1 });
  const [yDist, setYDist] = useState<DistParams>({ type: "normal", p1: 0, p2: 1 });
  const [bins, setBins] = useState<number[]>([]);
  const [binRange, setBinRange] = useState<[number, number]>([-6, 6]);
  const [simCount, setSimCount] = useState(0);
  const [showPdf, setShowPdf] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  // 均值 / 方差 (理论)
  const xCfg = DIST_CONFIGS[xDist.type];
  const yCfg = DIST_CONFIGS[yDist.type];

  const safeXDist = { ...xDist, p2: xDist.type === "uniform" ? Math.max(xDist.p1 + 0.5, xDist.p2) : xDist.p2 };
  const safeYDist = { ...yDist, p2: yDist.type === "uniform" ? Math.max(yDist.p1 + 0.5, yDist.p2) : yDist.p2 };

  const xMean = xCfg.mean(safeXDist);
  const yMean = yCfg.mean(safeYDist);
  const xVar = xCfg.variance(safeXDist);
  const yVar = yCfg.variance(safeYDist);
  const zMean = xMean + yMean;
  const zVar = xVar + yVar;

  const canSimulate = !(
    (xDist.type === "uniform" && xDist.p2 <= xDist.p1) ||
    (yDist.type === "uniform" && yDist.p2 <= yDist.p1)
  );

  const simulate = () => {
    if (!canSimulate || isRunning) return;
    setIsRunning(true);

    // 运行在事件处理内部，符合合同（Math.random 仅在事件处理中使用）
    const xs = sampleDist(safeXDist, N_SAMPLES);
    const zs = xs.map((x) => x + sampleDist(safeYDist, 1)[0]);
    // 重新计算，避免闭包问题
    const zSamples: number[] = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      zSamples.push(sampleDist(safeXDist, 1)[0] + sampleDist(safeYDist, 1)[0]);
    }

    // 自动确定范围（±3σ + padding）
    const sortedZ = [...zSamples].sort((a, b) => a - b);
    const lo = sortedZ[Math.floor(N_SAMPLES * 0.005)];
    const hi = sortedZ[Math.ceil(N_SAMPLES * 0.995)];
    const pad = (hi - lo) * 0.1;
    const rMin = lo - pad;
    const rMax = hi + pad;

    const newBins = buildHistogram(zSamples, rMin, rMax, N_BINS);
    setBins(newBins);
    setBinRange([rMin, rMax]);
    setSimCount((c) => c + 1);
    setIsRunning(false);
    void zs; // 消除未使用变量警告
  };

  const hasResult = bins.length > 0;
  const hasPdf = showPdf && hasAnalyticConvPDF(xDist.type, yDist.type);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">
          卷积演示：Z = X + Y 的分布
        </h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          分别选择 X、Y 的分布类型与参数，运行蒙特卡洛模拟 {N_SAMPLES.toLocaleString()} 次，观察 Z 的经验分布与理论 PDF。
        </p>
      </div>

      {/* X / Y 参数面板 */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <DistPanel
          label="X 分布"
          color={TEAL}
          dist={xDist}
          onChange={setXDist}
        />
        <div className="flex items-center justify-center text-[18px] font-bold text-[var(--ink-soft)] select-none">
          +
        </div>
        <DistPanel
          label="Y 分布"
          color={ACCENT}
          dist={yDist}
          onChange={setYDist}
        />
      </div>

      {/* 公式行 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-1.5">
        <div className="text-[12px] font-semibold text-[var(--ink)] mb-1">
          独立随机变量之和的期望与方差（可加性）
        </div>
        <div className="font-mono text-[11px] text-[var(--ink-soft)] space-y-0.5">
          <div>
            E[Z] = E[X] + E[Y]
            <span className="ml-3">
              ={" "}
              <span style={{ color: TEAL }} className="font-bold">
                {xMean.toFixed(3)}
              </span>{" "}
              +{" "}
              <span style={{ color: ACCENT }} className="font-bold">
                {yMean.toFixed(3)}
              </span>{" "}
              ={" "}
              <span className="font-bold text-[var(--ink)]">
                {zMean.toFixed(3)}
              </span>
            </span>
          </div>
          <div>
            Var[Z] = Var[X] + Var[Y]
            <span className="ml-3">
              ={" "}
              <span style={{ color: TEAL }} className="font-bold">
                {xVar.toFixed(3)}
              </span>{" "}
              +{" "}
              <span style={{ color: ACCENT }} className="font-bold">
                {yVar.toFixed(3)}
              </span>{" "}
              ={" "}
              <span className="font-bold text-[var(--ink)]">
                {zVar.toFixed(3)}
              </span>
            </span>
          </div>
          {hasPdf && (
            <div className="text-[10px] mt-1 text-[var(--ink-soft)]">
              [OK] 此组合有解析卷积公式，橙色曲线为理论 PDF
            </div>
          )}
        </div>
      </div>

      {/* 模拟按钮行 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={simulate}
          disabled={!canSimulate || isRunning}
          className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity"
          style={{
            background: canSimulate ? ACCENT : "var(--ink-faint)",
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? "模拟中..." : `模拟 ${N_SAMPLES.toLocaleString()} 次`}
        </button>

        {hasResult && (
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPdf}
              onChange={(e) => setShowPdf(e.target.checked)}
              className="cursor-pointer"
              style={{ accentColor: ORANGE }}
            />
            <span style={{ color: ORANGE }} className="font-medium">
              叠加理论 PDF
            </span>
          </label>
        )}

        {!canSimulate && (
          <span className="text-[11px] text-red-500">
            均匀分布需要 b &gt; a
          </span>
        )}

        {simCount > 0 && (
          <span className="ml-auto text-[11px] text-[var(--ink-soft)]">
            已模拟 {simCount} 次
          </span>
        )}
      </div>

      {/* 直方图区域 */}
      {hasResult ? (
        <div className="space-y-2">
          <HistogramSVG
            bins={bins}
            sampleCount={N_SAMPLES}
            binMin={binRange[0]}
            binMax={binRange[1]}
            xDist={safeXDist}
            yDist={safeYDist}
            showPdf={showPdf}
          />

          {/* 图例 */}
          <div className="flex flex-wrap gap-4 text-[11px] text-[var(--ink-soft)]">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded-sm opacity-60"
                style={{ background: ACCENT }}
              />
              经验直方图（密度）
            </div>
            {hasPdf && (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-5"
                  style={{ background: ORANGE }}
                />
                <span style={{ color: ORANGE }}>理论 PDF（卷积解析式）</span>
              </div>
            )}
            {!hasPdf && showPdf && (
              <div className="text-[10px] text-[var(--ink-soft)] opacity-60">
                （该组合暂无解析 PDF，仅显示经验分布）
              </div>
            )}
          </div>

          {/* 统计摘要 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "理论 E[Z]", val: zMean.toFixed(4), color: ACCENT },
              { label: "理论 σ[Z]", val: Math.sqrt(Math.max(0, zVar)).toFixed(4), color: TEAL },
              { label: "理论 Var[Z]", val: zVar.toFixed(4), color: ORANGE },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                className="rounded-lg p-2"
                style={{ background: color + "18" }}
              >
                <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
                <div
                  className="text-[14px] font-extrabold font-mono"
                  style={{ color }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg flex items-center justify-center"
          style={{
            height: H,
            background: GRAY_BG,
            border: `1px dashed ${GRAY_LINE}`,
          }}
        >
          <div className="text-center space-y-1">
            <div className="text-[13px] text-[var(--ink-soft)]">
              点击「模拟」按钮开始
            </div>
            <div className="text-[11px]" style={{ color: ACCENT }}>
              将生成 {N_SAMPLES.toLocaleString()} 对 (X,Y) 样本，计算 Z = X + Y
            </div>
          </div>
        </div>
      )}

      {/* 知识洞察 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">核心洞察：</span>
        当 X 和 Y 相互独立时，Z = X+Y 的分布由卷积决定：
        <span className="font-mono mx-1">f_Z(z) = ∫ f_X(x)·f_Y(z−x)dx</span>
        。期望和方差均可加，但分布形状取决于具体类型——
        两个正态相加仍是正态，两个均匀相加得三角/梯形，两个指数相加得 Erlang。
        尝试混合不同类型，观察中心极限定理的收敛趋势！
      </div>
    </div>
  );
}

export default memo(ConvolutionDemoBase);