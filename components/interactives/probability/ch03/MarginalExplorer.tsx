"use client";

import { CounterexamplePanel } from "./MarginalExplorer/CounterexamplePanel";

import { memo, useState, Fragment } from "react";
import { PRESET_MAIN, normalize, marginalX, marginalY, randomRaw, CE_A, CE_B, Y_LABELS, X_LABELS } from "@/lib/learning/probability/marginalDistributions";
import type { Tab, Mode } from "@/lib/learning/probability/marginalDistributions";
import { ACCENT, TEAL, ACCENT_LIGHT, TEAL_LIGHT, GRAY_BG } from "./MarginalExplorer/appearance";
import { Heatmap, MarginalBar } from "./MarginalExplorer/plot";
import { fmt4 } from "./MarginalExplorer/formatters";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function MarginalExplorerBase() {
  const [tab, setTab] = useState<Tab>("main");
  const [raw, setRaw] = useState<number[][]>(PRESET_MAIN.map((r) => [...r]));
  const [mode, setMode] = useState<Mode>("rowSelect");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null);
  const [editInput, setEditInput] = useState<string>("");

  // 归一化
  const p = normalize(raw);
  const pX = marginalX(p);
  const pY = marginalY(p);

  // 当前高亮行/列的原始概率行向量（边缘展示用）
  const highlightedRowProbs: number[] | null =
    mode === "rowSelect" && selectedRow !== null ? p[selectedRow] : null;
  const highlightedColProbs: number[] | null =
    mode === "colSelect" && selectedCol !== null
      ? p.map((row) => row[selectedCol!])
      : null;

  // 计算当前选中行的边缘概率（行求和即为 pX[i]）
  const currentMarginalVal: number | null =
    mode === "rowSelect" && selectedRow !== null
      ? pX[selectedRow]
      : mode === "colSelect" && selectedCol !== null
      ? pY[selectedCol]
      : null;

  const currentLabel: string =
    mode === "rowSelect" && selectedRow !== null
      ? `P(X=x${selectedRow + 1}) = Σⱼ p(x${selectedRow + 1},yⱼ)`
      : mode === "colSelect" && selectedCol !== null
      ? `P(Y=y${selectedCol + 1}) = Σᵢ p(xᵢ,y${selectedCol + 1})`
      : "";

  // 输入处理
  function handleInputChange(i: number, j: number, val: string) {
    setEditInput(val);
    setEditingCell([i, j]);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setRaw((prev) =>
        prev.map((row, ri) => row.map((v, ci) => (ri === i && ci === j ? num : v)))
      );
    }
  }

  function handleInputFocus(i: number, j: number) {
    setEditingCell([i, j]);
    setEditInput(raw[i][j].toString());
  }

  function handleInputBlur() {
    setEditingCell(null);
    setEditInput("");
  }

  function handleRandom() {
    setRaw(randomRaw(3));
    setSelectedRow(null);
    setSelectedCol(null);
  }

  function handleReset() {
    setRaw(PRESET_MAIN.map((r) => [...r]));
    setSelectedRow(null);
    setSelectedCol(null);
  }

  function handleRowClick(i: number) {
    if (mode !== "rowSelect") return;
    setSelectedRow((prev) => (prev === i ? null : i));
    setSelectedCol(null);
  }

  function handleColClick(j: number) {
    if (mode !== "colSelect") return;
    setSelectedCol((prev) => (prev === j ? null : j));
    setSelectedRow(null);
  }

  function handleModeChange(m: Mode) {
    setMode(m);
    setSelectedRow(null);
    setSelectedCol(null);
  }

  // 反例：计算 CE_A、CE_B 的边缘分布
  const pA = normalize(CE_A);
  const pB = normalize(CE_B);
  const pXA = marginalX(pA);
  const pYA = marginalY(pA);
  const pXB = marginalX(pB);
  const pYB = marginalY(pB);

  const marginalsMatch =
    pXA.every((v, i) => Math.abs(v - pXB[i]) < 0.001) &&
    pYA.every((v, j) => Math.abs(v - pYB[j]) < 0.001);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">边缘分布提取演示</h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
          点击行号提取 X 的边缘分布（对 Y 求和），点击列号提取 Y 的边缘分布（对 X 求和）——直观体会「投影」的含义。
        </p>
      </div>

      {/* 标签页 */}
      <div className="flex gap-1 rounded-lg bg-[var(--bg-muted)] p-1">
        {([
          { key: "main", label: "主探索器" },
          { key: "counterexample", label: "反例：同边缘，异联合" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors " +
              (tab === key
                ? "bg-[var(--bg-elevated)] shadow-sm text-[var(--ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ──────────── 主探索器 ──────────── */}
      {tab === "main" && (
        <div className="space-y-4">
          {/* 模式切换 */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[12px] text-[var(--ink-soft)]">投影方向：</span>
            <button
              onClick={() => handleModeChange("rowSelect")}
              className={
                "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
                (mode === "rowSelect"
                  ? "text-white"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)]")
              }
              style={{ background: mode === "rowSelect" ? ACCENT : undefined }}
            >
              固定 X → 对 Y 求和
            </button>
            <button
              onClick={() => handleModeChange("colSelect")}
              className={
                "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors " +
                (mode === "colSelect"
                  ? "text-white"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)]")
              }
              style={{ background: mode === "colSelect" ? TEAL : undefined }}
            >
              固定 Y → 对 X 求和
            </button>
            <button
              onClick={handleRandom}
              className="ml-auto rounded-lg px-2.5 py-1 text-[12px] font-medium bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak,#ede9fe)] transition-colors"
            >
              随机
            </button>
            <button
              onClick={handleReset}
              className="rounded-lg px-2.5 py-1 text-[12px] font-medium bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line,#e9ebf2)] transition-colors"
            >
              重置
            </button>
          </div>

          {/* 提示文字 */}
          <div
            className="rounded-lg px-3 py-2 text-[12px] font-medium border"
            style={{
              borderColor: mode === "rowSelect" ? `${ACCENT}40` : `${TEAL}40`,
              background: mode === "rowSelect" ? ACCENT_LIGHT : TEAL_LIGHT,
              color: mode === "rowSelect" ? ACCENT : TEAL,
            }}
          >
            {mode === "rowSelect"
              ? "点击左侧行标签（x₁/x₂/x₃）高亮整行，右侧条形图即为 P(X=xᵢ) = Σⱼ p(xᵢ,yⱼ)"
              : "点击顶部列标签（y₁/y₂/y₃）高亮整列，下方条形图即为 P(Y=yⱼ) = Σᵢ p(xᵢ,yⱼ)"}
          </div>

          {/* 核心布局 */}
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            {/* 左：可编辑输入网格 */}
            <div className="flex-shrink-0">
              <p className="text-[11px] text-[var(--ink-soft)] mb-1.5">输入任意正数（自动归一化）</p>
              <div className="grid gap-1" style={{ gridTemplateColumns: "auto repeat(3, 68px)" }}>
                <div className="text-[11px] text-[var(--ink-soft)] flex items-end justify-center pb-1">X↓ Y→</div>
                {Y_LABELS.map((yl) => (
                  <div key={yl} className="text-center text-[12px] font-semibold text-[var(--ink)]">{yl}</div>
                ))}
                {raw.map((row, i) => (
                  <Fragment key={`row-${i}`}>
                    <div className="flex items-center justify-center text-[12px] font-semibold text-[var(--ink)]">
                      {X_LABELS[i]}
                    </div>
                    {row.map((v, j) => {
                      const isEditing = editingCell !== null && editingCell[0] === i && editingCell[1] === j;
                      return (
                        <input
                          key={`inp-${i}-${j}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={isEditing ? editInput : v.toFixed(2)}
                          onChange={(e) => handleInputChange(i, j, e.target.value)}
                          onFocus={() => handleInputFocus(i, j)}
                          onBlur={handleInputBlur}
                          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-1 py-1.5 text-center text-[12px] font-mono text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-[var(--ink-soft)]">
                合计：<span className="font-mono font-semibold text-[var(--ink)]">
                  {raw.flatMap((r) => r).reduce((s, v) => s + Math.max(0, v), 0).toFixed(4)}
                </span>（归一化后 = 1）
              </div>
            </div>

            {/* 中：热力图 */}
            <div className="flex-shrink-0 flex flex-col gap-1">
              <p className="text-[11px] text-[var(--ink-soft)]">联合分布热力图（可点击行/列标签）</p>
              <Heatmap
                p={p}
                selectedRow={selectedRow}
                selectedCol={selectedCol}
                mode={mode}
                onRowClick={handleRowClick}
                onColClick={handleColClick}
              />
            </div>

            {/* 右：边缘分布条形图 */}
            <div className="flex-1 min-w-0">
              {mode === "rowSelect" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-[var(--ink-soft)]">
                    X 的边缘分布 P(X=xᵢ) ← 对该行所有 y 值求和
                  </p>
                  <MarginalBar
                    values={pX}
                    labels={X_LABELS}
                    color={ACCENT}
                    lightColor={ACCENT_LIGHT}
                    highlightIdx={selectedRow}
                    direction="horizontal"
                  />

                  {/* 展开该行各格子 */}
                  {selectedRow !== null && highlightedRowProbs !== null && (
                    <div
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: ACCENT_LIGHT, border: `1px solid ${ACCENT}40` }}
                    >
                      <div className="text-[12px] font-semibold" style={{ color: ACCENT }}>
                        {X_LABELS[selectedRow]} 这一行的分解
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {highlightedRowProbs.map((v, j) => (
                          <div key={j} className="text-center">
                            <div className="text-[10px] text-[var(--ink-soft)]">p(x{selectedRow + 1},{Y_LABELS[j]})</div>
                            <div
                              className="rounded-md px-2 py-1 text-[12px] font-mono font-bold"
                              style={{ background: "var(--bg-elevated)", color: ACCENT }}
                            >
                              {fmt4(v)}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center text-[12px] font-semibold" style={{ color: ACCENT }}>
                          = {fmt4(pX[selectedRow])}
                        </div>
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: `${ACCENT}cc` }}>
                        {currentLabel} = {highlightedRowProbs.map(fmt4).join(" + ")} = {fmt4(currentMarginalVal!)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-[var(--ink-soft)]">
                    Y 的边缘分布 P(Y=yⱼ) ← 对该列所有 x 值求和
                  </p>
                  <MarginalBar
                    values={pY}
                    labels={Y_LABELS}
                    color={TEAL}
                    lightColor={TEAL_LIGHT}
                    highlightIdx={selectedCol}
                    direction="horizontal"
                  />

                  {/* 展开该列各格子 */}
                  {selectedCol !== null && highlightedColProbs !== null && (
                    <div
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: TEAL_LIGHT, border: `1px solid ${TEAL}40` }}
                    >
                      <div className="text-[12px] font-semibold" style={{ color: TEAL }}>
                        {Y_LABELS[selectedCol]} 这一列的分解
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {highlightedColProbs.map((v, i) => (
                          <div key={i} className="text-center">
                            <div className="text-[10px] text-[var(--ink-soft)]">p({X_LABELS[i]},y{selectedCol + 1})</div>
                            <div
                              className="rounded-md px-2 py-1 text-[12px] font-mono font-bold"
                              style={{ background: "var(--bg-elevated)", color: TEAL }}
                            >
                              {fmt4(v)}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center text-[12px] font-semibold" style={{ color: TEAL }}>
                          = {fmt4(pY[selectedCol])}
                        </div>
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: `${TEAL}cc` }}>
                        {currentLabel} = {highlightedColProbs.map(fmt4).join(" + ")} = {fmt4(currentMarginalVal!)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 两组边缘分布汇总 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: GRAY_BG }}>
              <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">X 的边缘分布</div>
              <div className="flex gap-2">
                {pX.map((v, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className="text-[11px] text-[var(--ink-soft)]">{X_LABELS[i]}</div>
                    <div
                      className="mt-1 rounded-md py-1 text-[12px] font-mono font-bold"
                      style={{
                        background: mode === "rowSelect" && selectedRow === i ? ACCENT : ACCENT_LIGHT,
                        color: mode === "rowSelect" && selectedRow === i ? "#fff" : ACCENT,
                        transition: "background 0.2s",
                      }}
                    >
                      {fmt4(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: GRAY_BG }}>
              <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">Y 的边缘分布</div>
              <div className="flex gap-2">
                {pY.map((v, j) => (
                  <div key={j} className="flex-1 text-center">
                    <div className="text-[11px] text-[var(--ink-soft)]">{Y_LABELS[j]}</div>
                    <div
                      className="mt-1 rounded-md py-1 text-[12px] font-mono font-bold"
                      style={{
                        background: mode === "colSelect" && selectedCol === j ? TEAL : TEAL_LIGHT,
                        color: mode === "colSelect" && selectedCol === j ? "#fff" : TEAL,
                        transition: "background 0.2s",
                      }}
                    >
                      {fmt4(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 公式说明 */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
            <span className="font-semibold text-[var(--ink)]">边缘分布定义：</span>
            <span className="font-mono ml-1">P(X=xᵢ) = Σⱼ p(xᵢ,yⱼ)</span>
            {" "}即把联合分布表按行求和（对 Y「积分」掉）；
            <span className="font-mono ml-1">P(Y=yⱼ) = Σᵢ p(xᵢ,yⱼ)</span>
            {" "}即按列求和（对 X「积分」掉）。边缘分布是联合分布在某一维度的「投影」。
          </div>
        </div>
      )}

      {/* ──────────── 反例：同边缘不同联合 ──────────── */}
      {tab === "counterexample" && <CounterexamplePanel pA={pA} pXA={pXA} pYA={pYA} pB={pB} pXB={pXB} pYB={pYB} marginalsMatch={marginalsMatch} />}
    </div>
  );
}

export default memo(MarginalExplorerBase);