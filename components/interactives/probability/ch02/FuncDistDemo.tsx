"use client";

import { memo, useState, useCallback } from "react";
import { buildHistogram } from "@/lib/learning/probability/distributions/transformations";
import type { DistKey, TransformKey } from "@/lib/learning/probability/distributions/transformations";
import { DIST_CONFIGS, TRANSFORM_CONFIGS } from "./FuncDistDemo/settings";
import { TabBtn } from "./FuncDistDemo/controls";
import { PdfChart } from "./FuncDistDemo/plot";
import { ACCENT, ACCENT_LIGHT, GREEN, ORANGE } from "./FuncDistDemo/appearance";
// ─── 主组件 ──────────────────────────────────────────────────
function FuncDistDemoBase() {
  const [distKey, setDistKey] = useState<DistKey>("normal");
  const [transformKey, setTransformKey] = useState<TransformKey>("square");
  const [samples, setSamples] = useState<number[]>([]);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const dist = DIST_CONFIGS[distKey];
  const transform = TRANSFORM_CONFIGS[transformKey];

  // 执行采样
  const runSimulation = useCallback(() => {
    setIsRunning(true);
    const N = 10000;
    const rawSamples: number[] = [];
    for (let i = 0; i < N; i++) {
      rawSamples.push(dist.sample());
    }
    setSamples(rawSamples);
    setSampleCount(N);
    setIsRunning(false);
  }, [dist]);

  // 清空
  function reset() {
    setSamples([]);
    setSampleCount(0);
  }

  // Y 的样本
  const ySamples = samples.map(transform.apply);

  // Y 的范围
  const yMin = transform.yMin(distKey);
  const yMax = transform.yMax(distKey);

  // 构建直方图
  const HIST_BINS = 50;
  const histBins =
    ySamples.length > 0 ? buildHistogram(ySamples, HIST_BINS, yMin, yMax) : undefined;

  // Y 的理论 PDF
  const yPdfFn = (y: number) => transform.theoreticalPdf(y, distKey);

  // X 的 PDF
  const xPdfFn = dist.pdf;

  // 当前 Y 统计摘要
  const yMean =
    ySamples.length > 0
      ? ySamples.reduce((a, b) => a + b, 0) / ySamples.length
      : null;
  const yVar =
    ySamples.length > 0 && yMean !== null
      ? ySamples.reduce((a, b) => a + (b - yMean) ** 2, 0) / ySamples.length
      : null;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">随机变量函数的分布</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          选择 X 的分布和变换 g，左图为 X 的 PDF，右图为 Y=g(X) 的理论曲线与模拟直方图叠加。
        </p>
      </div>

      {/* 控制区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        {/* 选 X 的分布 */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-[var(--ink)]">
            X 的分布
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DIST_CONFIGS) as DistKey[]).map((k) => (
              <TabBtn
                key={k}
                active={distKey === k}
                onClick={() => {
                  setDistKey(k);
                  setSamples([]);
                  setSampleCount(0);
                }}
                color={DIST_CONFIGS[k].color}
              >
                {DIST_CONFIGS[k].shortLabel}
              </TabBtn>
            ))}
          </div>
        </div>

        {/* 选变换 g */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-[var(--ink)]">
            变换 Y = g(X)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TRANSFORM_CONFIGS) as TransformKey[]).map((k) => (
              <TabBtn
                key={k}
                active={transformKey === k}
                onClick={() => {
                  setTransformKey(k);
                  setSamples([]);
                  setSampleCount(0);
                }}
              >
                {TRANSFORM_CONFIGS[k].label}
              </TabBtn>
            ))}
          </div>
        </div>
      </div>

      {/* 图表区：X 的 PDF | Y 的 PDF + 直方图 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 左：X 的分布 */}
        <div className="rounded-lg border border-[var(--line)] p-2">
          <PdfChart
            title={`X ~ ${dist.label}`}
            xLabel="x"
            pdfFn={xPdfFn}
            xMin={dist.xMin}
            xMax={dist.xMax}
            color={dist.color}
          />
        </div>

        {/* 右：Y 的分布（理论 + 直方图） */}
        <div className="rounded-lg border border-[var(--line)] p-2">
          <PdfChart
            title={`Y = ${transform.label} 的分布`}
            xLabel="y"
            pdfFn={yPdfFn}
            xMin={yMin}
            xMax={yMax}
            color={ACCENT}
            histBins={histBins}
            histColor="#6366f1"
          />
        </div>
      </div>

      {/* 变换说明 */}
      <div
        className="rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed"
        style={{ borderColor: ACCENT + "44", background: ACCENT_LIGHT }}
      >
        <span className="font-semibold" style={{ color: ACCENT }}>
          变换原理：
        </span>
        <span className="text-[var(--ink-soft)]"> {transform.note}</span>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runSimulation}
          disabled={isRunning}
          className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {isRunning ? "模拟中…" : "模拟 10000 次"}
        </button>
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink-soft)] hover:bg-[var(--line)]"
        >
          清除
        </button>
        {sampleCount > 0 && (
          <span className="text-[12px] text-[var(--ink-soft)]">
            已采样 <b className="text-[var(--ink)]">{sampleCount.toLocaleString()}</b> 个点
          </span>
        )}
      </div>

      {/* 模拟统计摘要 */}
      {sampleCount > 0 && yMean !== null && yVar !== null && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "X 分布", val: dist.shortLabel, color: dist.color },
            { label: "变换 g", val: transform.shortLabel, color: ACCENT },
            {
              label: "Y 均值（模拟）",
              val: yMean.toFixed(4),
              color: GREEN,
            },
            {
              label: "Y 方差（模拟）",
              val: yVar.toFixed(4),
              color: ORANGE,
            },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              className="rounded-lg p-2.5 text-center"
              style={{ background: color + "18" }}
            >
              <div className="text-[10px] text-[var(--ink-soft)] leading-snug">{label}</div>
              <div
                className="mt-0.5 font-mono text-[14px] font-bold"
                style={{ color }}
              >
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 公式提示 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
        <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">
          变量变换公式（连续情形）
        </div>
        <div className="font-mono text-[11px] leading-loose">
          若 Y = g(X)，g 严格单调，则：
        </div>
        <div className="font-mono text-[11px] leading-loose">
          f_Y(y) = f_X(g⁻¹(y)) · |d/dy g⁻¹(y)|
        </div>
        <div className="font-mono text-[11px] leading-loose">
          非单调时（如 Y=X²）：对每个反函数分支分别求和。
        </div>
      </div>

      {/* 图例说明 */}
      <div className="flex flex-wrap gap-4 text-[11px] text-[var(--ink-soft)]">
        <div className="flex items-center gap-1.5">
          <div
            className="h-[3px] w-6 rounded-full"
            style={{ background: ACCENT }}
          />
          <span>理论 PDF 曲线</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-4 w-4 rounded-sm opacity-50"
            style={{ background: "#6366f1" }}
          />
          <span>模拟频率直方图（10000次）</span>
        </div>
      </div>
    </div>
  );
}

export default memo(FuncDistDemoBase);