"use client";

import { memo, useState } from "react";
import { ALL_FACES, MEMBERSHIP_CYCLE } from "@/lib/learning/probability/foundations/sampleSpace";
import type { OutcomeState, DiceFace, Membership } from "@/lib/learning/probability/foundations/sampleSpace";
import { NONE_COLOR, MEMBERSHIP_COLORS, A_COLOR, B_COLOR, ACCENT, BOTH_COLOR } from "./SampleSpaceBuilder/appearance";
import { DieFace, SetDisplay } from "./SampleSpaceBuilder/plot";
// ─────────────────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────────────────
function SampleSpaceBuilderBase() {
  const [outcomes, setOutcomes] = useState<OutcomeState[]>(
    ALL_FACES.map((f) => ({ face: f, membership: "none" }))
  );
  const [showHint, setShowHint] = useState(true);

  // 集合推导
  const setA = outcomes.filter((o) => o.membership === "A" || o.membership === "AB").map((o) => o.face);
  const setB = outcomes.filter((o) => o.membership === "B" || o.membership === "AB").map((o) => o.face);
  const union = [...new Set([...setA, ...setB])].sort((a, b) => a - b);
  const inter = setA.filter((x) => setB.includes(x)).sort((a, b) => a - b);
  const aDiffB = setA.filter((x) => !setB.includes(x)).sort((a, b) => a - b);
  const bDiffA = setB.filter((x) => !setA.includes(x)).sort((a, b) => a - b);
  const aComplement = ALL_FACES.filter((f) => !setA.includes(f));
  const bComplement = ALL_FACES.filter((f) => !setB.includes(f));

  function toggleMembership(face: DiceFace) {
    setShowHint(false);
    setOutcomes((prev) =>
      prev.map((o) =>
        o.face === face
          ? { ...o, membership: MEMBERSHIP_CYCLE[o.membership] }
          : o
      )
    );
  }

  function reset() {
    setOutcomes(ALL_FACES.map((f) => ({ face: f, membership: "none" })));
    setShowHint(true);
  }

  // 快速示例预设
  function applyPreset(name: string) {
    setShowHint(false);
    if (name === "odd-even") {
      // A = 奇数, B = 偶数
      setOutcomes(
        ALL_FACES.map((f) => ({
          face: f,
          membership: f % 2 === 1 ? "A" : "B",
        }))
      );
    } else if (name === "low-high") {
      // A = ≤3, B = ≥4
      setOutcomes(
        ALL_FACES.map((f) => ({
          face: f,
          membership: f <= 3 ? "A" : "B",
        }))
      );
    } else if (name === "prime-gt3") {
      // A = 质数{2,3,5}, B = >3{4,5,6}
      const primes: DiceFace[] = [2, 3, 5];
      const gt3: DiceFace[] = [4, 5, 6];
      setOutcomes(
        ALL_FACES.map((f) => {
          const inA = primes.includes(f);
          const inB = gt3.includes(f);
          const m: Membership = inA && inB ? "AB" : inA ? "A" : inB ? "B" : "none";
          return { face: f, membership: m };
        })
      );
    }
  }

  // 维恩图位置映射（6 个样本点 scatter）
  const OMEGA_W = 320;
  const OMEGA_H = 160;
  // A 区域中心 x=110, B 区域中心 x=210, 交集 x=170
  const CIRCLE_CX_A = 120;
  const CIRCLE_CX_B = 200;
  const CIRCLE_CY = 80;
  const CIRCLE_R = 65;

  // 每个点在维恩图上的固定坐标
  const VENN_POSITIONS: Record<DiceFace, { x: number; y: number }> = {
    1: { x: 72, y: 65 },
    2: { x: 85, y: 105 },
    3: { x: 100, y: 48 },
    4: { x: 235, y: 65 },
    5: { x: 165, y: 78 },
    6: { x: 248, y: 105 },
  };

  function pointFillByFace(face: DiceFace): string {
    const o = outcomes.find((x) => x.face === face);
    if (!o) return NONE_COLOR;
    return MEMBERSHIP_COLORS[o.membership];
  }

  function pointInRegion(face: DiceFace): boolean {
    const o = outcomes.find((x) => x.face === face);
    return o?.membership !== "none";
  }

  const totalSampleSpace = 6;
  const pA = setA.length / totalSampleSpace;
  const pB = setB.length / totalSampleSpace;
  const pUnion = union.length / totalSampleSpace;
  const pInter = inter.length / totalSampleSpace;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">样本空间构造器</h3>
          <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
            Ω = &#123;1, 2, 3, 4, 5, 6&#125;　投掷一枚均匀骰子
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--bg-muted)] px-3 py-1 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--line)] transition-colors"
        >
          重置
        </button>
      </div>

      {/* 提示 */}
      {showHint && (
        <div className="mb-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-weak)] px-3 py-2 text-[12px] text-[var(--accent-ink)]">
          点击骰子循环切换归属：无 → A → B → A∩B → 无
        </div>
      )}

      {/* 快速预设 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="self-center text-[11px] text-[var(--ink-soft)]">预设：</span>
        {[
          { key: "odd-even", label: "A=奇数 B=偶数" },
          { key: "low-high", label: "A=≤3 B=≥4" },
          { key: "prime-gt3", label: "A=质数 B=>3" },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 骰子交互区 */}
      <div
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 28,
          padding: "8px 4px",
        }}
      >
        {outcomes.map((o) => (
          <DieFace
            key={o.face}
            face={o.face}
            membership={o.membership}
            onClick={() => toggleMembership(o.face)}
          />
        ))}
      </div>

      {/* 图例 */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {(
          [
            { m: "none", label: "未分配" },
            { m: "A", label: "属于 A" },
            { m: "B", label: "属于 B" },
            { m: "AB", label: "属于 A 且 B" },
          ] as { m: Membership; label: string }[]
        ).map(({ m, label }) => (
          <span key={m} className="flex items-center gap-1">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: MEMBERSHIP_COLORS[m],
                display: "inline-block",
              }}
            />
            <span style={{ color: MEMBERSHIP_COLORS[m] }}>{label}</span>
          </span>
        ))}
      </div>

      {/* 维恩图可视化 */}
      <div className="mb-3 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-muted)]">
        <svg viewBox={`0 0 ${OMEGA_W} ${OMEGA_H}`} className="w-full" style={{ maxHeight: 180 }}>
          {/* Ω 边框 */}
          <rect x={4} y={4} width={OMEGA_W - 8} height={OMEGA_H - 8} rx={10} fill="var(--bg-muted)" stroke="var(--line)" strokeWidth={1.2} />
          <text x={12} y={20} fontSize={11} fill="var(--ink-faint)" fontStyle="italic">Ω</text>

          {/* A 圆（半透明）*/}
          <circle
            cx={CIRCLE_CX_A}
            cy={CIRCLE_CY}
            r={CIRCLE_R}
            fill={setA.length > 0 ? `${A_COLOR}18` : "transparent"}
            stroke={A_COLOR}
            strokeWidth={1.8}
            strokeDasharray={setA.length === 0 ? "5 4" : undefined}
          />
          <text x={CIRCLE_CX_A - CIRCLE_R + 8} y={22} fontSize={12} fontWeight={700} fill={A_COLOR}>A</text>

          {/* B 圆（半透明）*/}
          <circle
            cx={CIRCLE_CX_B}
            cy={CIRCLE_CY}
            r={CIRCLE_R}
            fill={setB.length > 0 ? `${B_COLOR}18` : "transparent"}
            stroke={B_COLOR}
            strokeWidth={1.8}
            strokeDasharray={setB.length === 0 ? "5 4" : undefined}
          />
          <text x={CIRCLE_CX_B + CIRCLE_R - 16} y={22} fontSize={12} fontWeight={700} fill={B_COLOR}>B</text>

          {/* 样本点 */}
          {outcomes.map((o) => {
            const pos = VENN_POSITIONS[o.face];
            const inASet = o.membership === "A" || o.membership === "AB";
            const inBSet = o.membership === "B" || o.membership === "AB";

            // 根据归属决定位置（动态）
            let tx = pos.x;
            let ty = pos.y;
            if (inASet && !inBSet) {
              // 在 A 但不在 B：放在 A 左侧区
              tx = CIRCLE_CX_A - 30 + ((o.face - 1) % 3) * 20;
              ty = CIRCLE_CY - 20 + Math.floor((o.face - 1) / 3) * 38;
            } else if (inBSet && !inASet) {
              // 在 B 但不在 A
              tx = CIRCLE_CX_B + 10 + ((o.face - 1) % 3) * 18;
              ty = CIRCLE_CY - 18 + Math.floor((o.face - 1) / 3) * 36;
            } else if (inASet && inBSet) {
              // 交集区
              tx = (CIRCLE_CX_A + CIRCLE_CX_B) / 2 - 12 + ((o.face - 1) % 2) * 22;
              ty = CIRCLE_CY - 14 + Math.floor((o.face - 1) / 2) * 26;
            } else {
              // 在 Ω 但不在 A 或 B：分布在两圆外侧
              const idx = ALL_FACES.filter(
                (f) => outcomes.find((x) => x.face === f)?.membership === "none"
              ).indexOf(o.face);
              const totalNone = outcomes.filter((x) => x.membership === "none").length;
              tx = 270 + (idx % 2) * 28;
              ty = 35 + Math.floor(idx / 2) * 32 + (totalNone <= 1 ? 16 : 0);
            }

            return (
              <g key={o.face} style={{ transition: "transform 0.3s ease" }}>
                <circle
                  cx={tx}
                  cy={ty}
                  r={pointInRegion(o.face) ? 13 : 11}
                  fill={pointFillByFace(o.face)}
                  opacity={o.membership === "none" ? 0.35 : 0.82}
                />
                <text
                  x={tx}
                  y={ty + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={o.membership === "none" ? "var(--ink)" : "white"}
                >
                  {o.face}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 集合运算面板 */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 space-y-2">
        <p className="text-[11px] font-semibold text-[var(--ink-soft)] uppercase tracking-wide mb-1">集合运算结果</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <SetDisplay label="A" elements={[...setA].sort((a, b) => a - b)} color={A_COLOR} />
          <SetDisplay label="B" elements={[...setB].sort((a, b) => a - b)} color={B_COLOR} />
          <SetDisplay label="A ∪ B" elements={union} color={ACCENT} />
          <SetDisplay label="A ∩ B" elements={inter} color={BOTH_COLOR} />
          <SetDisplay label="A − B" elements={aDiffB} color="#dc2626" />
          <SetDisplay label="B − A" elements={bDiffA} color="#d97706" />
          <SetDisplay label="Aᶜ" elements={aComplement} color="#64748b" />
          <SetDisplay label="Bᶜ" elements={bComplement} color="#64748b" />
        </div>
      </div>

      {/* 概率数值 */}
      {(setA.length > 0 || setB.length > 0) && (
        <div className="mt-3 rounded-lg bg-[var(--accent-weak)] border border-[var(--accent)] px-3 py-2">
          <p className="text-[11px] font-semibold text-[var(--accent-ink)] mb-1">古典概型下（等可能，|Ω|=6）</p>
          <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-[12px] font-mono">
            <span>
              <span style={{ color: A_COLOR }}>P(A)</span>
              {" = "}
              <b style={{ color: A_COLOR }}>{setA.length}/6 ≈ {pA.toFixed(3)}</b>
            </span>
            <span>
              <span style={{ color: B_COLOR }}>P(B)</span>
              {" = "}
              <b style={{ color: B_COLOR }}>{setB.length}/6 ≈ {pB.toFixed(3)}</b>
            </span>
            <span>
              <span style={{ color: ACCENT }}>P(A∪B)</span>
              {" = "}
              <b style={{ color: ACCENT }}>{union.length}/6 ≈ {pUnion.toFixed(3)}</b>
            </span>
            <span>
              <span style={{ color: BOTH_COLOR }}>P(A∩B)</span>
              {" = "}
              <b style={{ color: BOTH_COLOR }}>{inter.length}/6 ≈ {pInter.toFixed(3)}</b>
            </span>
          </div>
          {/* 加法公式验证 */}
          {setA.length > 0 && setB.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--accent-ink)]">
              验证加法公式：P(A∪B) = P(A) + P(B) − P(A∩B) ={" "}
              <b>{setA.length}/6 + {setB.length}/6 − {inter.length}/6 = {union.length}/6</b>
              {pA + pB - pInter === pUnion ? " [OK]" : ""}
            </p>
          )}
        </div>
      )}

      {/* 底部注释 */}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-soft)]">
        事件 = 样本空间的子集。把样本点分配给 A、B 后，并 / 交 / 差 / 补即是标准集合运算。
      </p>
    </div>
  );
}

export default memo(SampleSpaceBuilderBase);