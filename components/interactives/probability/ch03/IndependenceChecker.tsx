"use client";

import { memo, useState } from "react";
import { INIT_GRID, computeMarginalsAndIndex, PRESETS } from "@/lib/learning/probability/joint/independence";
import type { Grid3x3 } from "@/lib/learning/probability/joint/independence";
import { GREEN, RED, ACCENT, ACCENT_LIGHT, deviationBg, deviationColor, YELLOW, GREEN_LIGHT, YELLOW_LIGHT, RED_LIGHT } from "./IndependenceChecker/appearance";
import { MarginalBadge, IndependenceGauge } from "./IndependenceChecker/plot";
import { CellEditor } from "./IndependenceChecker/controls";
import { fmtShort, fmt } from "./IndependenceChecker/formatters";
// ─── Main component ───────────────────────────────────────────────────────────
function IndependenceCheckerBase() {
  const [grid, setGrid] = useState<Grid3x3>(() => INIT_GRID.map((r) => [...r]) as Grid3x3);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>([1, 1]);
  const [showFormula, setShowFormula] = useState(false);
  const [activePreset, setActivePreset] = useState(0);

  const { rowMargins, colMargins, total, independent, deviations, maxDev } =
    computeMarginalsAndIndex(grid);

  // Normalize so grid sums to 1 after edits
  const normGrid: Grid3x3 = grid.map((row) =>
    row.map((v) => (total > 0 ? v / total : 0))
  ) as Grid3x3;

  function handleCellChange(r: number, c: number, rawVal: number) {
    const next = grid.map((row, ri) =>
      row.map((v, ci) => (ri === r && ci === c ? rawVal : v))
    ) as Grid3x3;
    setGrid(next);
  }

  function handlePreset(idx: number) {
    setActivePreset(idx);
    setGrid(PRESETS[idx].grid.map((r) => [...r]) as Grid3x3);
    setSelectedCell(null);
  }

  function handleRandomize() {
    // Generate random joint dist by randomly perturbing from independence
    const p: [number, number, number] = [Math.random(), Math.random(), Math.random()];
    const q: [number, number, number] = [Math.random(), Math.random(), Math.random()];
    const pSum = p[0] + p[1] + p[2];
    const qSum = q[0] + q[1] + q[2];
    const pn: [number, number, number] = [p[0] / pSum, p[1] / pSum, p[2] / pSum];
    const qn: [number, number, number] = [q[0] / qSum, q[1] / qSum, q[2] / qSum];
    // Add random perturbations
    const rawGrid: Grid3x3 = [
      [
        pn[0] * qn[0] + (Math.random() - 0.5) * 0.05,
        pn[0] * qn[1] + (Math.random() - 0.5) * 0.05,
        pn[0] * qn[2] + (Math.random() - 0.5) * 0.05,
      ],
      [
        pn[1] * qn[0] + (Math.random() - 0.5) * 0.05,
        pn[1] * qn[1] + (Math.random() - 0.5) * 0.05,
        pn[1] * qn[2] + (Math.random() - 0.5) * 0.05,
      ],
      [
        pn[2] * qn[0] + (Math.random() - 0.5) * 0.05,
        pn[2] * qn[1] + (Math.random() - 0.5) * 0.05,
        pn[2] * qn[2] + (Math.random() - 0.5) * 0.05,
      ],
    ];
    // Clamp negatives
    const clampedGrid = rawGrid.map((row) => row.map((v) => Math.max(v, 0.001))) as Grid3x3;
    setGrid(clampedGrid);
    setActivePreset(-1);
    setSelectedCell(null);
  }

  const xLabels = ["X₁", "X₂", "X₃"];
  const yLabels = ["Y₁", "Y₂", "Y₃"];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">随机变量独立性检验器</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          编辑联合分布表，实时检验 p(xᵢ,yⱼ) = pᵢ·qⱼ 是否成立。
          <span style={{ color: GREEN }} className="font-semibold"> 绿</span>色表示接近独立，
          <span style={{ color: RED }} className="font-semibold"> 红</span>色表示偏离独立假设。
        </p>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handlePreset(idx)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{
              background: activePreset === idx ? ACCENT : "var(--bg-muted)",
              color: activePreset === idx ? "white" : "var(--ink-soft)",
              border: `1px solid ${activePreset === idx ? ACCENT : "var(--line)"}`,
            }}
            title={p.description}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={handleRandomize}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            background: activePreset === -1 ? ACCENT : "var(--bg-muted)",
            color: activePreset === -1 ? "white" : "var(--ink-soft)",
            border: `1px solid ${activePreset === -1 ? ACCENT : "var(--line)"}`,
          }}
        >
          随机分布
        </button>
      </div>

      {/* Main grid + marginals */}
      <div className="overflow-x-auto">
        <div className="min-w-[340px]">
          {/* Column headers + column marginals */}
          <div className="flex items-end mb-1 ml-[64px] gap-1.5">
            {yLabels.map((yl, j) => (
              <div key={j} className="flex-1 text-center">
                <div className="text-[11px] font-semibold text-[var(--ink-soft)] mb-0.5">{yl}</div>
                <MarginalBadge
                  value={total > 0 ? colMargins[j] / total : 0}
                  label={`q${j + 1}`}
                  color={ACCENT}
                />
              </div>
            ))}
            <div className="w-[54px] text-center text-[9px] text-[var(--ink-soft)] self-end pb-1">边缘分布</div>
          </div>

          {/* Rows */}
          {xLabels.map((xl, i) => (
            <div key={i} className="flex items-center gap-1.5 mb-1.5">
              {/* Row label + row marginal */}
              <div className="flex flex-col items-center w-[64px] shrink-0 gap-0.5">
                <div className="text-[11px] font-semibold text-[var(--ink-soft)]">{xl}</div>
                <MarginalBadge
                  value={total > 0 ? rowMargins[i] / total : 0}
                  label={`p${i + 1}`}
                  color="#7c3aed"
                />
              </div>

              {/* 3 cells */}
              {[0, 1, 2].map((j) => {
                const isSelected = selectedCell !== null && selectedCell[0] === i && selectedCell[1] === j;
                return (
                  <div key={j} className="flex-1">
                    <CellEditor
                      value={grid[i][j]}
                      dev={deviations[i][j]}
                      maxDev={maxDev}
                      isSelected={isSelected}
                      onClick={() => setSelectedCell(isSelected ? null : [i, j])}
                      onChange={(v) => handleCellChange(i, j, v)}
                      row={i}
                      col={j}
                      independent={independent[i][j] * total}
                    />
                  </div>
                );
              })}

              {/* Row sum */}
              <div
                className="w-[54px] shrink-0 rounded-md px-1 py-1 text-center text-[11px] font-mono"
                style={{ background: "var(--bg-muted)", color: "var(--ink-soft)" }}
              >
                <div className="text-[9px]">行和</div>
                <div className="font-bold text-[var(--ink)]">{fmtShort(rowMargins[i])}</div>
              </div>
            </div>
          ))}

          {/* Column sums row */}
          <div className="flex items-center gap-1.5 ml-[64px]">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="flex-1 rounded-md px-1 py-1 text-center text-[11px] font-mono"
                style={{ background: "var(--bg-muted)", color: "var(--ink-soft)" }}
              >
                <div className="text-[9px]">列和</div>
                <div className="font-bold text-[var(--ink)]">{fmtShort(colMargins[j])}</div>
              </div>
            ))}
            <div
              className="w-[54px] shrink-0 rounded-md px-1 py-1 text-center text-[11px] font-mono"
              style={{ background: ACCENT_LIGHT, color: ACCENT }}
            >
              <div className="text-[9px]">总和</div>
              <div className="font-bold">{fmtShort(total)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Instruction when cell selected */}
      {selectedCell !== null && (
        <div
          className="rounded-lg px-3 py-2 text-[12px] leading-relaxed"
          style={{ background: ACCENT_LIGHT, color: ACCENT }}
        >
          <span className="font-semibold">
            已选中 ({xLabels[selectedCell[0]]}, {yLabels[selectedCell[1]]}):
          </span>{" "}
          拖动格子内的滑块调整概率值。当前值 ={" "}
          <span className="font-mono font-bold">{fmt(grid[selectedCell[0]][selectedCell[1]])}</span>
          ，独立参考值 ={" "}
          <span className="font-mono font-bold">{fmt(independent[selectedCell[0]][selectedCell[1]])}</span>
          ，偏差 ={" "}
          <span
            className="font-mono font-bold"
            style={{ color: Math.abs(deviations[selectedCell[0]][selectedCell[1]]) < 0.002 ? GREEN : RED }}
          >
            {deviations[selectedCell[0]][selectedCell[1]] >= 0 ? "+" : ""}
            {fmt(deviations[selectedCell[0]][selectedCell[1]])}
          </span>
        </div>
      )}

      {/* Independence gauge */}
      <IndependenceGauge maxDev={maxDev} />

      {/* Independence reference grid (mini) */}
      <div className="rounded-lg border border-[var(--line)] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-[var(--ink)]">独立参考分布 pᵢ·qⱼ</span>
          <span className="text-[11px] text-[var(--ink-soft)]">若 X⊥Y，则联合分布应等于此值</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px] font-mono">
            <thead>
              <tr>
                <th className="text-[var(--ink-soft)] pb-1 pr-2 text-left font-normal">pᵢ·qⱼ</th>
                {yLabels.map((yl, j) => (
                  <th key={j} className="pb-1 text-center font-semibold" style={{ color: ACCENT }}>
                    {yl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xLabels.map((xl, i) => (
                <tr key={i}>
                  <td className="pr-2 font-semibold" style={{ color: "#7c3aed" }}>{xl}</td>
                  {[0, 1, 2].map((j) => {
                    const actualNorm = normGrid[i][j];
                    const indepVal = independent[i][j];
                    const dev = deviations[i][j];
                    const isClose = Math.abs(dev) < 0.002;
                    return (
                      <td
                        key={j}
                        className="py-1 px-2 text-center rounded"
                        style={{
                          background: deviationBg(dev, maxDev),
                          color: deviationColor(dev, maxDev),
                          fontWeight: 600,
                        }}
                        title={`独立参考: ${fmt(indepVal)} | 实际: ${fmt(actualNorm)}`}
                      >
                        {fmtShort(indepVal)}
                        {isClose ? " [OK]" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formula explanation toggle */}
      <div>
        <button
          onClick={() => setShowFormula(!showFormula)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
          style={{ color: ACCENT }}
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: showFormula ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
          独立性定义与检验方法
        </button>

        {showFormula && (
          <div className="mt-2 rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">
            <div>
              <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">独立性定义</div>
              <div className="font-mono">X ⊥ Y  ⟺  P(X=xᵢ, Y=yⱼ) = P(X=xᵢ)·P(Y=yⱼ)</div>
              <div className="font-mono mt-1">
                即：p(xᵢ,yⱼ) = pᵢ·qⱼ &nbsp;对所有 i,j 成立
              </div>
            </div>
            <div>
              <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">边缘分布计算</div>
              <div className="font-mono">pᵢ = P(X=xᵢ) = Σⱼ P(xᵢ,yⱼ)（行求和）</div>
              <div className="font-mono mt-0.5">qⱼ = P(Y=yⱼ) = Σᵢ P(xᵢ,yⱼ)（列求和）</div>
            </div>
            <div>
              <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">独立性指数</div>
              <div className="font-mono">δ = max&#x7B;|p(xᵢ,yⱼ) − pᵢ·qⱼ|&#x7D;</div>
              <div className="mt-1">
                δ = 0 ⟹ 完全独立；δ 越大，X 与 Y 相关性越强。
                本组件中当前 δ ={" "}
                <span className="font-mono font-bold" style={{ color: maxDev < 0.01 ? GREEN : maxDev < 0.05 ? YELLOW : RED }}>
                  {fmt(maxDev)}
                </span>
              </div>
            </div>
            <div>
              <div className="font-semibold text-[13px] text-[var(--ink)] mb-1">颜色含义</div>
              <div className="flex gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: GREEN }} />
                  <span>绿 = p(xᵢ,yⱼ) ≈ pᵢ·qⱼ（独立）</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: YELLOW }} />
                  <span>黄 = 轻微偏差</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: RED }} />
                  <span>红 = 显著违反独立性</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insight panel */}
      <div
        className="rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed"
        style={{
          borderColor: maxDev < 0.01 ? GREEN : maxDev < 0.05 ? YELLOW : RED,
          background: maxDev < 0.01 ? GREEN_LIGHT : maxDev < 0.05 ? YELLOW_LIGHT : RED_LIGHT,
          color: maxDev < 0.01 ? GREEN : maxDev < 0.05 ? YELLOW : RED,
        }}
      >
        {maxDev < 0.005 && (
          <span>
            <strong>X 与 Y 相互独立！</strong> 每格实际概率几乎等于边缘乘积 pᵢ·qⱼ，
            知道 X 的取值不改变 Y 的概率分布。
          </span>
        )}
        {maxDev >= 0.005 && maxDev < 0.05 && (
          <span>
            <strong>近似独立</strong>（δ = {fmt(maxDev)}）。存在轻微统计关联，
            在实际问题中通常可视为独立处理。
          </span>
        )}
        {maxDev >= 0.05 && maxDev < 0.12 && (
          <span>
            <strong>弱相关，不独立</strong>（δ = {fmt(maxDev)}）。红色格子的
            p(xᵢ,yⱼ) 偏离 pᵢ·qⱼ 较多，X 与 Y 存在可观测的统计依赖关系。
          </span>
        )}
        {maxDev >= 0.12 && (
          <span>
            <strong>强相关，显著不独立</strong>（δ = {fmt(maxDev)}）。红色高亮格子
            说明联合概率远超或远低于边缘乘积——X 的取值对 Y 的分布有显著影响。
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(IndependenceCheckerBase);