"use client";

import { memo, useState } from "react";
import { normalizeMatrix, INDEP_JOINT, CORR_JOINT, clampPositive, marginalX, conditionalXgivenY } from "@/lib/learning/probability/joint/conditional";
import type { Matrix3x3 } from "@/lib/learning/probability/joint/conditional";
import { ACCENT, ACCENT_LIGHT, TEAL_LIGHT, TEAL, GRAY_BAR } from "./ConditionalExplorer/appearance";
import { fmt } from "./ConditionalExplorer/formatters";
import { BarChart } from "./ConditionalExplorer/plot";
// ─── 主组件 ───────────────────────────────────────────────────
function ConditionalExplorerBase() {
  // 联合分布矩阵（行=Y，列=X）
  const [joint, setJoint] = useState<Matrix3x3>(normalizeMatrix(INDEP_JOINT));
  // 当前选中的行（Y 的取值索引）
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  // 相关性开关
  const [correlated, setCorrelated] = useState(false);

  // 切换相关性
  function toggleCorrelation() {
    const next = !correlated;
    setCorrelated(next);
    setJoint(normalizeMatrix(next ? CORR_JOINT : INDEP_JOINT));
    setSelectedRow(null);
  }

  // 编辑单元格
  function handleCellChange(i: number, j: number, raw: string) {
    const parsed = parseFloat(raw);
    const val = isNaN(parsed) ? 0 : clampPositive(parsed);
    const next: Matrix3x3 = joint.map((row, ri) =>
      row.map((v, ci) => (ri === i && ci === j ? val : v))
    ) as Matrix3x3;
    setJoint(normalizeMatrix(next));
  }

  // 将矩阵元素放大到较易编辑的百分比（×100）后再展示
  // 用户仍输入 0–1 小数
  const marg = marginalX(joint);
  const cond: [number, number, number] | null =
    selectedRow !== null ? conditionalXgivenY(joint, selectedRow) : null;

  const rowSums: [number, number, number] = [
    joint[0][0] + joint[0][1] + joint[0][2],
    joint[1][0] + joint[1][1] + joint[1][2],
    joint[2][0] + joint[2][1] + joint[2][2],
  ];

  const xLabels: [string, string, string] = ["x₁", "x₂", "x₃"];
  const yLabels: [string, string, string] = ["y₁", "y₂", "y₃"];

  // 检测是否独立：P(X|Y=yi) ≈ P(X) 对所有 i
  function isNearlyIndependent(): boolean {
    for (let i = 0; i < 3; i++) {
      const c = conditionalXgivenY(joint, i);
      for (let j = 0; j < 3; j++) {
        if (Math.abs(c[j] - marg[j]) > 0.03) return false;
      }
    }
    return true;
  }

  const independent = isNearlyIndependent();

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-5">
      {/* 标题 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--ink)]">条件分布探索器</h3>
          <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
            点击左表中的一行（选定 Y=yᵢ），右侧自动计算并对比 P(X|Y=yᵢ) 与边缘 P(X)。
          </p>
        </div>
        {/* 相关性开关 */}
        <button
          onClick={toggleCorrelation}
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{
            borderColor: correlated ? ACCENT : "var(--line)",
            background: correlated ? ACCENT_LIGHT : "var(--bg-muted)",
            color: correlated ? ACCENT : "var(--ink-soft)",
          }}
        >
          <span
            className="inline-block h-4 w-7 rounded-full transition-all relative"
            style={{ background: correlated ? ACCENT : "var(--line)" }}
          >
            <span
              className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
              style={{ left: correlated ? "14px" : "2px" }}
            />
          </span>
          {correlated ? "X 与 Y 正相关" : "X 与 Y 独立"}
        </button>
      </div>

      {/* 独立性提示横幅 */}
      <div
        className="rounded-lg px-3 py-2 text-[12px] font-medium leading-snug"
        style={{
          background: independent ? TEAL_LIGHT : ACCENT_LIGHT,
          color: independent ? TEAL : ACCENT,
        }}
      >
        {independent
          ? "当前联合分布近似独立：P(X|Y=yᵢ) ≈ P(X)，条件分布与边缘分布几乎相同。"
          : "当前联合分布不独立：P(X|Y=yᵢ) 随 i 变化而变化，条件信息改变了 X 的分布。"}
      </div>

      {/* 主体：联合分布表 + 柱状图 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── 左：联合分布编辑表 ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">联合分布 P(X=xⱼ, Y=yᵢ)</span>
            <span className="text-[11px] text-[var(--ink-soft)]">点击行选定 Y=yᵢ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr>
                  <th className="w-10 py-1.5 text-left text-[var(--ink-soft)] font-normal pr-2">Y \ X</th>
                  {xLabels.map((xl) => (
                    <th key={xl} className="py-1.5 text-center font-semibold text-[var(--ink)]">
                      {xl}
                    </th>
                  ))}
                  <th className="py-1.5 text-center font-semibold text-[var(--ink-soft)]">P(Y)</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => {
                  const isSelected = selectedRow === i;
                  return (
                    <tr
                      key={i}
                      onClick={() => setSelectedRow(isSelected ? null : i)}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: isSelected ? ACCENT_LIGHT : "transparent",
                      }}
                    >
                      <td
                        className="py-1.5 pr-2 font-semibold rounded-l-md"
                        style={{ color: isSelected ? ACCENT : "var(--ink-soft)" }}
                      >
                        {yLabels[i]}
                        {isSelected && (
                          <span
                            className="ml-1 text-[9px] font-bold uppercase"
                            style={{ color: ACCENT }}
                          >
                            OK
                          </span>
                        )}
                      </td>
                      {[0, 1, 2].map((j) => (
                        <td key={j} className="py-1 px-1 text-center">
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={fmt(joint[i][j])}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleCellChange(i, j, e.target.value)}
                            className="w-16 rounded border text-center text-[12px] font-mono py-0.5 focus:outline-none focus:ring-1"
                            style={{
                              borderColor: isSelected ? ACCENT : "var(--line)",
                              background: isSelected ? "var(--bg-elevated)" : "var(--bg-muted)",
                              color: isSelected ? ACCENT : "var(--ink)",
                            }}
                          />
                        </td>
                      ))}
                      <td
                        className="py-1.5 text-center font-mono font-semibold rounded-r-md"
                        style={{ color: isSelected ? ACCENT : "var(--ink-soft)" }}
                      >
                        {fmt(rowSums[i])}
                      </td>
                    </tr>
                  );
                })}
                {/* 边缘 P(X) 行 */}
                <tr className="border-t border-[var(--line)]">
                  <td className="pt-2 text-[var(--ink-soft)] font-normal text-[11px]">P(X)</td>
                  {marg.map((v, j) => (
                    <td key={j} className="pt-2 text-center font-mono font-semibold text-[var(--ink)]">
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="pt-2 text-center font-mono text-[var(--ink-soft)]">1.000</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 行选择提示 */}
          {selectedRow === null && (
            <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] py-3 text-center text-[12px] text-[var(--ink-soft)]">
              ← 点击任意行，查看该 Y 值下的条件分布
            </div>
          )}
        </div>

        {/* ── 右：柱状图对比 ── */}
        <div className="space-y-3">
          <span className="text-[13px] font-semibold text-[var(--ink)]">分布对比</span>

          {/* 边缘 P(X) 柱状图（始终显示） */}
          <BarChart
            values={marg}
            color={GRAY_BAR}
            label="边缘分布 P(X)"
            xLabels={xLabels}
          />

          {/* 条件分布柱状图（选中行后显示） */}
          {cond !== null && selectedRow !== null ? (
            <BarChart
              values={cond}
              color={ACCENT}
              label={`条件分布 P(X | Y=${yLabels[selectedRow]})`}
              xLabels={xLabels}
            />
          ) : (
            <div
              className="rounded-lg border border-dashed text-center py-6 text-[12px] text-[var(--ink-soft)]"
              style={{ borderColor: ACCENT + "55", background: ACCENT_LIGHT + "55" }}
            >
              选中左侧某行后
              <br />
              此处显示条件分布 P(X|Y=yᵢ)
            </div>
          )}

          {/* 差异摘要：选中行后展示 */}
          {cond !== null && selectedRow !== null && (
            <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--ink)] mb-1">
                各列偏差 |P(X=xⱼ|Y={yLabels[selectedRow]}) − P(X=xⱼ)|
              </div>
              {xLabels.map((xl, j) => {
                const diff = Math.abs(cond[j] - marg[j]);
                const isLarge = diff > 0.05;
                return (
                  <div key={j} className="flex items-center gap-2 text-[11px]">
                    <span className="w-4 font-semibold text-[var(--ink-soft)]">{xl}</span>
                    <div
                      className="flex-1 h-3 rounded-full overflow-hidden"
                      style={{ background: "var(--line)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(diff / 0.5, 1) * 100}%`,
                          background: isLarge ? ACCENT : TEAL,
                        }}
                      />
                    </div>
                    <span
                      className="w-12 text-right font-mono font-semibold"
                      style={{ color: isLarge ? ACCENT : TEAL }}
                    >
                      {diff.toFixed(3)}
                    </span>
                    {isLarge && (
                      <span className="text-[10px]" style={{ color: ACCENT }}>
                        差异显著
                      </span>
                    )}
                  </div>
                );
              })}
              <div
                className="mt-1.5 text-[11px] leading-snug"
                style={{ color: independent ? TEAL : ACCENT }}
              >
                {independent
                  ? "差异极小 → X 与 Y 独立，条件分布 = 边缘分布。"
                  : "差异明显 → X 与 Y 不独立，知道 Y=yᵢ 会改变对 X 的预期。"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 公式面板 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-2 text-[12px]">
        <div className="font-semibold text-[13px] text-[var(--ink)]">核心公式</div>
        <div className="font-mono text-[var(--ink-soft)] leading-loose space-y-1">
          <div>
            <span className="text-[var(--ink)] font-semibold">边缘分布：</span>{" "}
            P(X=xⱼ) = Σᵢ P(X=xⱼ, Y=yᵢ)
          </div>
          <div>
            <span className="text-[var(--ink)] font-semibold">条件分布：</span>{" "}
            P(X=xⱼ | Y=yᵢ) = P(X=xⱼ, Y=yᵢ) / P(Y=yᵢ)
          </div>
          {selectedRow !== null && cond !== null && (
            <div
              className="mt-1 rounded px-2 py-1 text-[11.5px] font-mono"
              style={{ background: ACCENT_LIGHT, color: ACCENT }}
            >
              当前：P(Y={yLabels[selectedRow]}) = {fmt(rowSums[selectedRow])}，
              归一化后得到右侧紫色柱状图。
            </div>
          )}
          <div>
            <span className="text-[var(--ink)] font-semibold">独立充要：</span>{" "}
            P(X=xⱼ | Y=yᵢ) = P(X=xⱼ)，对所有 i, j 成立
          </div>
        </div>
      </div>

      {/* 关键数据格 */}
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map((i) => {
          const c = conditionalXgivenY(joint, i);
          const isSelected = selectedRow === i;
          return (
            <div
              key={i}
              className="rounded-lg p-2.5 text-center cursor-pointer border transition-all"
              style={{
                borderColor: isSelected ? ACCENT : "var(--line)",
                background: isSelected ? ACCENT_LIGHT : "var(--bg-muted)",
              }}
              onClick={() => setSelectedRow(isSelected ? null : i)}
            >
              <div
                className="text-[10px] font-semibold mb-1"
                style={{ color: isSelected ? ACCENT : "var(--ink-soft)" }}
              >
                Y = {yLabels[i]}
              </div>
              <div className="space-y-0.5">
                {c.map((v, j) => (
                  <div
                    key={j}
                    className="text-[11px] font-mono flex justify-between px-1"
                    style={{ color: isSelected ? ACCENT : "var(--ink)" }}
                  >
                    <span>{xLabels[j]}</span>
                    <span className="font-semibold">{fmt(v)}</span>
                  </div>
                ))}
              </div>
              <div
                className="mt-1 text-[9px]"
                style={{ color: isSelected ? ACCENT : "var(--ink-soft)" }}
              >
                {isSelected ? "已选中" : "点击查看"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">使用指南：</span>
        ① 点击左表中任意行（Y=yᵢ）激活该条件；
        ② 右侧出现紫色柱状图，即为 P(X|Y=yᵢ) 的归一化结果；
        ③ 与灰色边缘分布 P(X) 对比，差异越大说明 X 与 Y 越相关；
        ④ 切换「相关性开关」加载预设独立或正相关联合分布；
        ⑤ 直接修改表格数值自定义联合分布，系统自动归一化。
      </div>
    </div>
  );
}

export default memo(ConditionalExplorerBase);