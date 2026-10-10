"use client";

import { memo, useState, useCallback } from "react";
import { isPosSemiDef, eigen2x2 } from "@/lib/learning/probability/moments/covarianceMatrix";
import { SCALE, SVG_W, SVG_H, CX, GRAY_LINE, CY, INK_SOFT, ACCENT, RED_LIGHT, RED, ACCENT_LIGHT } from "./CovMatrixDemo/appearance";
import { ellipsePoints } from "./CovMatrixDemo/geometry";
import { SliderRow } from "./CovMatrixDemo/controls";
// ─── 主组件 ───────────────────────────────────────────────────────────────────
function CovMatrixDemoBase() {
  // 协方差矩阵参数：σ₁², σ₂², ρ（相关系数）
  // 矩阵 Σ = [[σ₁², ρσ₁σ₂], [ρσ₁σ₂, σ₂²]]
  const [s1sq, setS1sq] = useState(1.0);  // σ₁² ∈ (0,4]
  const [s2sq, setS2sq] = useState(0.5);  // σ₂² ∈ (0,4]
  const [rho, setRho] = useState(0.6);    // ρ ∈ (-1,1)

  // 是否显示特征向量
  const [showAxes, setShowAxes] = useState(true);
  // 是否显示预设按钮区
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ─── 派生量 ───────────────────────────────────────────────────
  const cov12 = rho * Math.sqrt(s1sq) * Math.sqrt(s2sq); // ρ·σ₁·σ₂
  const posDefOk = isPosSemiDef(s1sq, s2sq, rho);
  const det = s1sq * s2sq - cov12 * cov12;

  const { lambda1, lambda2, v1, v2 } = eigen2x2(s1sq, cov12, s2sq);

  // 三条等高线的 k 值（标准差倍数）：1σ, 2σ, 3σ
  const kLevels: { k: number; opacity: number; dash: string }[] = [
    { k: 1.0, opacity: 1.0, dash: "" },
    { k: 2.0, opacity: 0.6, dash: "5,3" },
    { k: 3.0, opacity: 0.35, dash: "3,4" },
  ];

  // 特征向量方向上的轴端点（长轴 = v2，短轴 = v1）
  const axisLen2 = Math.sqrt(Math.max(0, lambda2)) * SCALE; // 长半轴像素
  const axisLen1 = Math.sqrt(Math.max(0, lambda1)) * SCALE; // 短半轴像素

  // 坐标轴网格
  const gridLines = [-2, -1, 0, 1, 2];

  // 预设示例
  const presets = [
    { name: "正相关", s1: 1.5, s2: 1.0, r: 0.8 },
    { name: "负相关", s1: 1.5, s2: 1.0, r: -0.8 },
    { name: "独立", s1: 1.2, s2: 0.6, r: 0.0 },
    { name: "强压缩", s1: 3.0, s2: 0.3, r: 0.3 },
  ] as const;

  const applyPreset = useCallback(
    (p: { name: string; s1: number; s2: number; r: number }) => {
      setS1sq(p.s1);
      setS2sq(p.s2);
      setRho(p.r);
      setActivePreset(p.name);
    },
    []
  );

  // 格式化为 3 位小数
  const f3 = (v: number) => v.toFixed(3);
  const f2 = (v: number) => v.toFixed(2);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">
          协方差矩阵与等高线椭圆
        </h3>
        <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
          调整 2×2 协方差矩阵的参数，实时观察二维正态分布等高线椭圆的形状、方向与特征值变化。
        </p>
      </div>

      {/* 主体：左=SVG，右=矩阵+数值 */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* ── SVG 可视化 ── */}
        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full rounded-lg border border-[var(--line)]"
            style={{ background: "var(--bg-muted)", maxHeight: 340 }}
          >
            {/* 坐标网格 */}
            {gridLines.map((v) => (
              <g key={`grid-${v}`}>
                <line
                  x1={CX + v * SCALE}
                  y1={20}
                  x2={CX + v * SCALE}
                  y2={SVG_H - 20}
                  stroke={v === 0 ? "var(--ink-faint)" : GRAY_LINE}
                  strokeWidth={v === 0 ? 1.2 : 0.8}
                  strokeDasharray={v !== 0 ? "4,4" : undefined}
                />
                <line
                  x1={20}
                  y1={CY - v * SCALE}
                  x2={SVG_W - 20}
                  y2={CY - v * SCALE}
                  stroke={v === 0 ? "var(--ink-faint)" : GRAY_LINE}
                  strokeWidth={v === 0 ? 1.2 : 0.8}
                  strokeDasharray={v !== 0 ? "4,4" : undefined}
                />
                {v !== 0 && (
                  <>
                    <text
                      x={CX + v * SCALE}
                      y={CY + 14}
                      fontSize="10"
                      textAnchor="middle"
                      fill={INK_SOFT}
                    >
                      {v}
                    </text>
                    <text
                      x={CX - 10}
                      y={CY - v * SCALE + 4}
                      fontSize="10"
                      textAnchor="end"
                      fill={INK_SOFT}
                    >
                      {v}
                    </text>
                  </>
                )}
              </g>
            ))}

            {/* 轴标签 */}
            <text x={SVG_W - 18} y={CY + 14} fontSize="12" fill="var(--ink)" fontStyle="italic">
              x₁
            </text>
            <text x={CX + 8} y={24} fontSize="12" fill="var(--ink)" fontStyle="italic">
              x₂
            </text>

            {/* 等高线椭圆（3 条） */}
            {posDefOk &&
              kLevels.map(({ k, opacity, dash }) => (
                <polyline
                  key={`ellipse-${k}`}
                  points={ellipsePoints(CX, CY, lambda1, lambda2, v1, v2, k, SCALE)}
                  fill={ACCENT + Math.round(opacity * 30).toString(16).padStart(2, "0")}
                  stroke={ACCENT}
                  strokeWidth={k === 1 ? 2 : 1.2}
                  strokeOpacity={opacity}
                  strokeDasharray={dash || undefined}
                />
              ))}

            {/* 非正定警告框 */}
            {!posDefOk && (
              <g>
                <rect
                  x={CX - 120}
                  y={CY - 30}
                  width={240}
                  height={60}
                  rx={8}
                  fill={RED_LIGHT}
                  stroke={RED}
                  strokeWidth={1.5}
                />
                <text x={CX} y={CY - 5} fontSize="13" textAnchor="middle" fill={RED} fontWeight="700">
                  矩阵非正定！
                </text>
                <text x={CX} y={CY + 14} fontSize="11" textAnchor="middle" fill={RED}>
                  |ρ| 过大或方差为零，无法定义椭圆
                </text>
              </g>
            )}

            {/* 特征向量轴（长轴 / 短轴） */}
            {showAxes && posDefOk && (
              <>
                {/* 长半轴（v2 方向，对应 λ₂） */}
                {[1, -1].map((sign) => (
                  <line
                    key={`v2-${sign}`}
                    x1={CX}
                    y1={CY}
                    x2={CX + sign * v2[0] * axisLen2}
                    y2={CY - sign * v2[1] * axisLen2}
                    stroke="#f59e0b"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                ))}
                {/* 长轴标签 */}
                <text
                  x={CX + v2[0] * (axisLen2 + 14)}
                  y={CY - v2[1] * (axisLen2 + 14) + 4}
                  fontSize="11"
                  fill="#d97706"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  √λ₂
                </text>

                {/* 短半轴（v1 方向，对应 λ₁） */}
                {[1, -1].map((sign) => (
                  <line
                    key={`v1-${sign}`}
                    x1={CX}
                    y1={CY}
                    x2={CX + sign * v1[0] * axisLen1}
                    y2={CY - sign * v1[1] * axisLen1}
                    stroke="#10b981"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                ))}
                <text
                  x={CX + v1[0] * (axisLen1 + 14)}
                  y={CY - v1[1] * (axisLen1 + 14) + 4}
                  fontSize="11"
                  fill="#059669"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  √λ₁
                </text>

                {/* 中心点 */}
                <circle cx={CX} cy={CY} r={3} fill={ACCENT} />
              </>
            )}

            {/* 等高线图例（右下角） */}
            {posDefOk && (
              <g>
                {kLevels.map(({ k, opacity, dash }, i) => (
                  <g key={`legend-${k}`}>
                    <line
                      x1={SVG_W - 90}
                      y1={SVG_H - 50 + i * 16}
                      x2={SVG_W - 74}
                      y2={SVG_H - 50 + i * 16}
                      stroke={ACCENT}
                      strokeWidth={1.8}
                      strokeOpacity={opacity}
                      strokeDasharray={dash || undefined}
                    />
                    <text
                      x={SVG_W - 70}
                      y={SVG_H - 46 + i * 16}
                      fontSize="10"
                      fill={INK_SOFT}
                    >
                      {k}σ 等高线
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* ── 右侧：矩阵展示 + 特征值 ── */}
        <div className="w-full lg:w-56 shrink-0 space-y-3">
          {/* 协方差矩阵 */}
          <div
            className="rounded-lg p-3 text-[13px]"
            style={{ background: posDefOk ? ACCENT_LIGHT : RED_LIGHT }}
          >
            <div
              className="text-[11px] font-semibold mb-2"
              style={{ color: posDefOk ? ACCENT : RED }}
            >
              协方差矩阵 Σ
            </div>
            {/* 矩阵括号 */}
            <div className="flex items-center gap-1">
              <div className="flex flex-col items-end text-[18px] text-[var(--ink-soft)]">
                <span>⎡</span>
                <span>⎣</span>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-around font-mono text-[12px]">
                  <span style={{ color: ACCENT }} className="font-bold">{f2(s1sq)}</span>
                  <span style={{ color: "#7c3aed" }}>{f3(cov12)}</span>
                </div>
                <div className="flex justify-around font-mono text-[12px]">
                  <span style={{ color: "#7c3aed" }}>{f3(cov12)}</span>
                  <span style={{ color: "#2563eb" }} className="font-bold">{f2(s2sq)}</span>
                </div>
              </div>
              <div className="flex flex-col items-start text-[18px] text-[var(--ink-soft)]">
                <span>⎤</span>
                <span>⎦</span>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-[var(--ink-soft)]">
              det(Σ) ={" "}
              <span
                className="font-mono font-bold"
                style={{ color: det >= -1e-9 ? ACCENT : RED }}
              >
                {det.toFixed(4)}
              </span>
            </div>
          </div>

          {/* 特征值与特征向量 */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 space-y-2">
            <div className="text-[11px] font-semibold text-[var(--ink)]">
              特征值 / 特征向量
            </div>
            {/* λ₁（小） */}
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: "#10b981" }}
                />
                <span className="text-[11px] text-[var(--ink-soft)]">λ₁（短半轴²）</span>
              </div>
              <div className="font-mono text-[13px] font-bold" style={{ color: "#059669" }}>
                {lambda1 >= 0 ? lambda1.toFixed(4) : <span style={{ color: RED }}>≤ 0 !</span>}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] font-mono">
                v₁ ≈ ({v1[0].toFixed(3)}, {v1[1].toFixed(3)})
              </div>
              <div className="text-[10px] text-[var(--ink-soft)]">
                短轴 = {lambda1 >= 0 ? Math.sqrt(Math.max(0, lambda1)).toFixed(3) : "—"}
              </div>
            </div>
            {/* λ₂（大） */}
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: "#f59e0b" }}
                />
                <span className="text-[11px] text-[var(--ink-soft)]">λ₂（长半轴²）</span>
              </div>
              <div className="font-mono text-[13px] font-bold" style={{ color: "#d97706" }}>
                {lambda2 >= 0 ? lambda2.toFixed(4) : <span style={{ color: RED }}>≤ 0 !</span>}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] font-mono">
                v₂ ≈ ({v2[0].toFixed(3)}, {v2[1].toFixed(3)})
              </div>
              <div className="text-[10px] text-[var(--ink-soft)]">
                长轴 = {lambda2 >= 0 ? Math.sqrt(Math.max(0, lambda2)).toFixed(3) : "—"}
              </div>
            </div>
            {/* 旋转角 */}
            <div className="border-t border-[var(--line)] pt-1.5 text-[10px] text-[var(--ink-soft)]">
              椭圆旋转角:{" "}
              <span className="font-mono font-semibold text-[var(--ink)]">
                {((Math.atan2(v2[1], v2[0]) * 180) / Math.PI).toFixed(1)}°
              </span>
            </div>
          </div>

          {/* 正定状态 badge */}
          <div
            className="rounded-lg px-3 py-2 text-center text-[12px] font-bold"
            style={{
              background: posDefOk ? "#dcfce7" : RED_LIGHT,
              color: posDefOk ? "#15803d" : RED,
              border: `1.5px solid ${posDefOk ? "#86efac" : RED}`,
            }}
          >
            {posDefOk ? "半正定 [OK]" : "非正定 [X] — |ρ| 须 < 1"}
          </div>
        </div>
      </div>

      {/* ── 控制面板 ── */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3 space-y-3">
        <div className="text-[12px] font-semibold text-[var(--ink)]">调整协方差矩阵参数</div>
        <SliderRow
          label="方差 σ₁²（X₁方向）"
          symbol="σ₁²"
          value={s1sq}
          min={0.1}
          max={4}
          step={0.05}
          onChange={(v) => { setS1sq(v); setActivePreset(null); }}
          color={ACCENT}
          fmt={f2}
        />
        <SliderRow
          label="方差 σ₂²（X₂方向）"
          symbol="σ₂²"
          value={s2sq}
          min={0.1}
          max={4}
          step={0.05}
          onChange={(v) => { setS2sq(v); setActivePreset(null); }}
          color="#2563eb"
          fmt={f2}
        />
        <SliderRow
          label="相关系数 ρ"
          symbol="ρ"
          value={rho}
          min={-0.99}
          max={0.99}
          step={0.01}
          onChange={(v) => { setRho(v); setActivePreset(null); }}
          color="#7c3aed"
          fmt={f2}
        />
      </div>

      {/* ── 开关 + 预设 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAxes((v) => !v)}
          className={
            "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors " +
            (showAxes
              ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
              : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]")
          }
        >
          {showAxes ? "隐藏" : "显示"}特征向量轴
        </button>

        <div className="h-4 border-l border-[var(--line)]" />

        <span className="text-[11px] text-[var(--ink-soft)]">快速预设：</span>
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p)}
            className={
              "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors " +
              (activePreset === p.name
                ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--line)]")
            }
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* ── 公式推导面板 ── */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-4 py-3 space-y-2 text-[12px] text-[var(--ink-soft)]">
        <div className="font-semibold text-[13px] text-[var(--ink)]">原理速查</div>
        <div className="space-y-1 leading-relaxed">
          <div>
            <span className="font-mono font-semibold text-[var(--ink)]">等高线方程</span>：
            (x − μ)ᵀ Σ⁻¹ (x − μ) = k²，是以原点为中心的椭圆（k = 1, 2, 3）
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--ink)]">谱分解</span>：
            Σ = Q Λ Qᵀ，其中 Λ = diag(λ₁, λ₂)，Q 的列为特征向量 v₁, v₂
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--ink)]">椭圆轴长</span>：
            长半轴 = √λ₂ · k，短半轴 = √λ₁ · k；方向 = 特征向量 v₂, v₁
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--ink)]">ρ 的含义</span>：
            |ρ| 越大，椭圆越细（越扁）；ρ 的符号决定椭圆倾斜方向（右上 vs 右下）
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--ink)]">正定条件</span>：
            σ₁², σ₂² &gt; 0 且 |ρ| &lt; 1（等价 det(Σ) = σ₁²σ₂²(1 − ρ²) &gt; 0）
          </div>
        </div>

        {/* 当前数值代入 */}
        <div
          className="mt-2 rounded bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[11px] border border-[var(--line)]"
          style={{ color: posDefOk ? "var(--ink)" : RED }}
        >
          <div>
            Σ = [[{f2(s1sq)}, {f3(cov12)}], [{f3(cov12)}, {f2(s2sq)}]]
          </div>
          <div>
            det = σ₁²·σ₂²·(1−ρ²) = {f2(s1sq)}·{f2(s2sq)}·(1−{f2(rho)}²) ={" "}
            <span style={{ color: posDefOk ? ACCENT : RED, fontWeight: 700 }}>
              {det.toFixed(4)}
            </span>
          </div>
          <div>
            λ₁ = {lambda1.toFixed(4)}, λ₂ = {lambda2.toFixed(4)},  tr = {(lambda1 + lambda2).toFixed(4)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(CovMatrixDemoBase);