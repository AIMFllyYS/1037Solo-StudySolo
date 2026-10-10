"use client";

import { memo, useState } from "react";
import { N_SAMPLES, ACCENT, ORANGE, GREEN, GRAY_LINE, ACCENT_LIGHT, ORANGE_LIGHT, GREEN_LIGHT, ROSE } from "./NormalSamplingDemo/appearance";
import { drawSample, ksStatistic, normalCDF, chi2CDF, tCDF, ksPValue, normalPDF, chi2PDF, tPDF } from "@/lib/learning/probability/sampling/normalSampling";
import { SliderRow } from "./NormalSamplingDemo/controls";
import { HistChart } from "./NormalSamplingDemo/plot";
// ─── 主组件 ────────────────────────────────────────────────────

function NormalSamplingDemoBase() {
  const [mu, setMu] = useState(0);
  const [sigma, setSigma] = useState(1);
  const [n, setN] = useState(10);

  // 抽样结果
  const [xbars, setXbars] = useState<number[]>([]);
  const [chi2Vals, setChi2Vals] = useState<number[]>([]);
  const [tVals, setTVals] = useState<number[]>([]);
  const [running, setRunning] = useState(false);

  // KS p 值
  const [ksXbar, setKsXbar] = useState(0);
  const [ksChi2, setKsChi2] = useState(0);
  const [ksT, setKsT] = useState(0);

  function runSampling() {
    setRunning(true);
    // 在下一个宏任务中执行（避免 UI 卡死）
    setTimeout(() => {
      const newXbars: number[] = [];
      const newChi2: number[] = [];
      const newT: number[] = [];

      for (let i = 0; i < N_SAMPLES; i++) {
        const [xbar, s2] = drawSample(mu, sigma, n);
        newXbars.push(xbar);
        // (n-1)S²/σ² ~ χ²(n-1)
        const chi2v = s2 > 0 ? ((n - 1) * s2) / (sigma * sigma) : 0;
        newChi2.push(chi2v);
        // t = (X̄ - μ) / (S / √n) ~ t(n-1)
        const tVal = s2 > 0 ? (xbar - mu) / (Math.sqrt(s2) / Math.sqrt(n)) : 0;
        newT.push(tVal);
      }

      // KS 统计量
      const sortedXbar = [...newXbars].sort((a, b) => a - b);
      const sortedChi2 = [...newChi2].sort((a, b) => a - b);
      const sortedT = [...newT].sort((a, b) => a - b);

      const sigmaXbar = sigma / Math.sqrt(n);
      const dXbar = ksStatistic(sortedXbar, (x) => normalCDF((x - mu) / sigmaXbar));
      const dChi2 = ksStatistic(sortedChi2, (x) => chi2CDF(x, n - 1));
      const dT = ksStatistic(sortedT, (x) => tCDF(x, n - 1));

      setXbars(newXbars);
      setChi2Vals(newChi2);
      setTVals(newT);
      setKsXbar(ksPValue(dXbar, N_SAMPLES));
      setKsChi2(ksPValue(dChi2, N_SAMPLES));
      setKsT(ksPValue(dT, N_SAMPLES));
      setRunning(false);
    }, 0);
  }

  function reset() {
    setXbars([]);
    setChi2Vals([]);
    setTVals([]);
    setKsXbar(0);
    setKsChi2(0);
    setKsT(0);
  }

  // 理论参数
  const sigmaXbar = sigma / Math.sqrt(n);
  const df = n - 1;

  // X̄ 直方图范围：[μ - 4σ_x̄, μ + 4σ_x̄]
  const xbarRange: [number, number] = [mu - 4 * sigmaXbar, mu + 4 * sigmaXbar];

  // χ² 范围：[0, df + 5√(2df)]
  const chi2Max = Math.max(df + 5 * Math.sqrt(2 * df), df * 3);
  const chi2Range: [number, number] = [0, chi2Max];

  // t 范围：[-5, 5]（t 分布尾重）
  const tRange: [number, number] = [-5, 5];

  const hasData = xbars.length > 0;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">正态总体抽样分布仿真</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          设定正态总体参数与样本量，重复抽样 {N_SAMPLES.toLocaleString()} 次，实证验证四大抽样定理。
          蓝色柱 = 模拟经验分布；曲线 = 理论概率密度；K-S 检验 p 值衡量吻合度。
        </p>
      </div>

      {/* 参数控制区 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">
          总体设定：X ~ N(μ, σ²)
        </div>
        <SliderRow
          label="均值 μ"
          value={mu}
          min={-2}
          max={2}
          step={0.1}
          display={mu.toFixed(1)}
          color={ACCENT}
          onChange={(v) => { setMu(v); reset(); }}
        />
        <SliderRow
          label="标准差 σ"
          value={sigma}
          min={0.5}
          max={3}
          step={0.1}
          display={sigma.toFixed(1)}
          color={ORANGE}
          onChange={(v) => { setSigma(v); reset(); }}
        />
        <SliderRow
          label="样本量 n"
          value={n}
          min={2}
          max={30}
          step={1}
          display={String(n)}
          color={GREEN}
          onChange={(v) => { setN(v); reset(); }}
        />

        {/* 理论参数预告 */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            {
              label: "X̄ ~ N(μ, σ²/n)",
              val: `N(${mu.toFixed(1)}, ${(sigma * sigma / n).toFixed(3)})`,
              color: ACCENT,
            },
            {
              label: "(n−1)S²/σ² ~ χ²(n−1)",
              val: `χ²(${df})`,
              color: ORANGE,
            },
            {
              label: "t = (X̄−μ)/(S/√n)",
              val: `t(${df})`,
              color: GREEN,
            },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              className="rounded-md p-2"
              style={{ background: color + "18" }}
            >
              <div className="text-[9px] text-[var(--ink-soft)] leading-tight">{label}</div>
              <div className="text-[11px] font-bold font-mono mt-0.5" style={{ color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={runSampling}
          disabled={running}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity"
          style={{
            background: ACCENT,
            opacity: running ? 0.6 : 1,
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "仿真中…" : `▶ 重复抽样 ${N_SAMPLES.toLocaleString()} 次`}
        </button>
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-[13px] font-medium text-[var(--ink-soft)] hover:bg-[var(--line)]"
        >
          重置
        </button>
        {hasData && (
          <span className="text-[12px] text-[var(--ink-soft)] ml-auto">
            已完成 {N_SAMPLES.toLocaleString()} 次抽样，每次 n = {n} 个观测
          </span>
        )}
      </div>

      {/* 四图区域（2+1布局） */}
      {!hasData ? (
        <div
          className="rounded-lg border-2 border-dashed py-12 text-center text-[13px] text-[var(--ink-soft)]"
          style={{ borderColor: GRAY_LINE }}
        >
          点击「重复抽样」按钮，开始仿真验证四大抽样定理
        </div>
      ) : (
        <div className="space-y-3">
          {/* 上排：X̄ + χ² */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HistChart
              title="样本均值 X̄"
              subtitle={`理论分布：N(μ, σ²/n) = N(${mu.toFixed(2)}, ${(sigma * sigma / n).toFixed(3)})`}
              data={xbars}
              nBins={40}
              xMin={xbarRange[0]}
              xMax={xbarRange[1]}
              color={ACCENT}
              colorLight={ACCENT_LIGHT}
              pdfFn={(x) => normalPDF(x, mu, sigmaXbar)}
              ksPValue={ksXbar}
              nSamples={N_SAMPLES}
              xLabel="x̄"
            />

            <HistChart
              title="卡方统计量 (n−1)S²/σ²"
              subtitle={`理论分布：χ²(n−1) = χ²(${df})`}
              data={chi2Vals}
              nBins={40}
              xMin={0}
              xMax={chi2Range[1]}
              color={ORANGE}
              colorLight={ORANGE_LIGHT}
              pdfFn={(x) => chi2PDF(x, df)}
              ksPValue={ksChi2}
              nSamples={N_SAMPLES}
              xLabel="(n−1)S²/σ²"
            />
          </div>

          {/* 下排：t统计量 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HistChart
              title="t 统计量  (X̄ − μ) / (S/√n)"
              subtitle={`理论分布：t(n−1) = t(${df})（厚尾，比正态宽）`}
              data={tVals}
              nBins={40}
              xMin={tRange[0]}
              xMax={tRange[1]}
              color={GREEN}
              colorLight={GREEN_LIGHT}
              pdfFn={(x) => tPDF(x, df)}
              ksPValue={ksT}
              nSamples={N_SAMPLES}
              xLabel="t"
            />

            {/* 综合 K-S 汇总卡片 */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 flex flex-col justify-between">
              <div>
                <div className="text-[13px] font-bold text-[var(--ink)] mb-1">K-S 检验汇总</div>
                <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed mb-3">
                  K-S 检验零假设：样本来自指定理论分布。
                  p值 &gt; 0.05 表示无统计显著偏差，即<b className="text-[var(--ink)]">实证与理论高度吻合</b>。
                </p>
                <div className="space-y-2">
                  {[
                    { label: "X̄ vs N(μ, σ²/n)", p: ksXbar, color: ACCENT },
                    { label: "(n−1)S²/σ² vs χ²(n−1)", p: ksChi2, color: ORANGE },
                    { label: "t vs t(n−1)", p: ksT, color: GREEN },
                  ].map(({ label, p, color }) => {
                    const pass = p >= 0.05;
                    return (
                      <div key={label} className="rounded-md bg-[var(--bg-elevated)] border border-[var(--line)] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
                          <span
                            className="text-[11px] font-mono font-bold"
                            style={{ color: pass ? GREEN : ROSE }}
                          >
                            p = {p.toFixed(4)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full overflow-hidden bg-[var(--bg-muted)]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, p * 100 / 0.1)}%`,
                              background: pass ? GREEN : ROSE,
                            }}
                          />
                        </div>
                        <div className="mt-0.5 text-[9px]" style={{ color: pass ? GREEN : ROSE }}>
                          {pass ? "[OK] 不拒绝 H₀（吻合理论）" : "[X] 拒绝 H₀（n 太小时属正常）"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 核心结论 */}
              <div
                className="mt-3 rounded-lg p-2.5 text-[11px] leading-relaxed"
                style={{ background: ACCENT_LIGHT, color: ACCENT }}
              >
                <div className="font-bold mb-1">三大定理验证结论</div>
                <div>① X̄ 服从正态分布 N(μ, σ²/n)—— 期望/方差缩放 √n 倍</div>
                <div>② (n−1)S²/σ² 独立于 X̄，服从 χ²(n−1)</div>
                <div>③ t 统计量服从 t(n−1)，比标准正态有更厚的尾部</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 知识提示 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[11px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">教学要点：</span>
        增大 n 时，X̄ 的分布向均值 μ 收缩（方差 σ²/n → 0），t 分布趋近于标准正态；
        σ 越大，所有统计量的离散程度越大，但 K-S 检验仍验证理论形状正确。
        这三个统计量是区间估计与假设检验的基础构建块。
      </div>
    </div>
  );
}

export default memo(NormalSamplingDemoBase);