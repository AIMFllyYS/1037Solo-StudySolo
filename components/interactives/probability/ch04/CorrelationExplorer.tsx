"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { generateBivariateNormal, generateUncorrDependent, sampleCorr } from "@/lib/learning/probability/moments/correlation";
import type { Mode, Point } from "@/lib/learning/probability/moments/correlation";
import { DATA_RANGE_Y_MAX, DATA_RANGE, toSvgX, toSvgY } from "./CorrelationExplorer/geometry";
import { RhoSlider } from "./CorrelationExplorer/controls";
import { ACCENT_LIGHT, ACCENT, ORANGE_LIGHT, ORANGE, W, H, PAD, PLOT_W, PLOT_H, GRAY_BORDER } from "./CorrelationExplorer/appearance";
// ─── 主组件 ──────────────────────────────────────────────────────────────────
function CorrelationExplorerBase() {
  const [rho, setRho] = useState(0.6);
  const [mode, setMode] = useState<Mode>("normal");
  const [points, setPoints] = useState<Point[]>(() =>
    generateBivariateNormal(0.6, 200)
  );
  const [pointsReady, setPointsReady] = useState(true);

  // 重新采样（rho 改变 或 重新生成 时）
  const resample = useCallback(
    (newRho: number, newMode: Mode) => {
      if (newMode === "uncorr-dependent") {
        setPoints(generateUncorrDependent(200));
      } else {
        setPoints(generateBivariateNormal(newRho, 200));
      }
      setPointsReady(true);
    },
    []
  );

  function handleRhoChange(v: number) {
    setRho(v);
    if (mode === "normal") {
      setPoints(generateBivariateNormal(v, 200));
    }
  }

  function handleModeToggle() {
    const next: Mode = mode === "normal" ? "uncorr-dependent" : "normal";
    setMode(next);
    resample(rho, next);
  }

  function handleResample() {
    resample(rho, mode);
    // 触发重渲染
    setPointsReady(false);
    setTimeout(() => setPointsReady(true), 10);
  }

  // 计算样本相关系数
  const sampledCorr = useMemo(() => sampleCorr(points), [points]);

  // 确定 Y 轴范围（Y=X² 时范围不同）
  const isDependent = mode === "uncorr-dependent";
  const yRange = isDependent ? DATA_RANGE_Y_MAX : DATA_RANGE;

  // 相关系数文字描述
  function corrDescription(r: number): string {
    const a = Math.abs(r);
    if (a < 0.05) return "几乎无线性关系";
    if (a < 0.3) return r > 0 ? "弱正相关" : "弱负相关";
    if (a < 0.6) return r > 0 ? "中等正相关" : "中等负相关";
    if (a < 0.85) return r > 0 ? "强正相关" : "强负相关";
    if (a < 0.99) return r > 0 ? "极强正相关" : "极强负相关";
    return r > 0 ? "完全正相关（退化为直线）" : "完全负相关（退化为直线）";
  }

  // ρ 接近 ±1 时显示提示
  const isDegenerate = Math.abs(rho) >= 0.98 && mode === "normal";

  // 椭圆形状（正态下：用于示意主轴倾斜方向）
  // 基于 rho 的主轴倾角（45° 时 rho=1）
  const ellipseAngle = mode === "normal" ? Math.atan(rho) * (180 / Math.PI) : 0;

  // 最大 y 数据（用于坐标轴刻度）
  const yTickVals = isDependent ? [0, 4, 9] : [-3, 0, 3];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 space-y-4">
      {/* 标题区 */}
      <div>
        <h3 className="text-[15px] font-bold text-[var(--ink)]">
          相关系数可视化实验室
        </h3>
        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 leading-relaxed">
          拖动 ρ 滑块实时生成二维正态散点云，直观感受相关系数的几何意义。
          底部可切换「不相关但不独立」的经典反例。
        </p>
      </div>

      {/* ρ 滑块 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3">
        <RhoSlider value={rho} onChange={handleRhoChange} />
        {isDegenerate && (
          <div
            className="mt-2 rounded-md px-3 py-1.5 text-[11px] font-medium leading-snug"
            style={{ background: ACCENT_LIGHT, color: ACCENT }}
          >
            ρ ≈ {rho > 0 ? "+1" : "−1"}：散点退化为一条直线！
            X 与 Y 存在严格线性关系 Y = {rho > 0 ? "" : "−"}X（方差消失）。
          </div>
        )}
      </div>

      {/* SVG 散点图 */}
      <div className="relative rounded-lg overflow-hidden border border-[var(--line)]">
        {/* 右上角：样本 r 值徽章 */}
        <div
          className="absolute top-2 right-2 z-10 rounded-lg px-3 py-1.5 shadow-sm text-center"
          style={{
            background: isDependent ? ORANGE_LIGHT : ACCENT_LIGHT,
            border: `1.5px solid ${isDependent ? ORANGE : ACCENT}`,
          }}
        >
          <div
            className="text-[10px] font-medium"
            style={{ color: isDependent ? ORANGE : ACCENT }}
          >
            样本相关系数 r
          </div>
          <div
            className="text-[18px] font-extrabold font-mono leading-tight"
            style={{ color: isDependent ? ORANGE : ACCENT }}
          >
            {sampledCorr >= 0 ? "+" : ""}{sampledCorr.toFixed(3)}
          </div>
          {!isDependent && (
            <div className="text-[9px] mt-0.5" style={{ color: ACCENT }}>
              {corrDescription(sampledCorr)}
            </div>
          )}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
          {/* 背景 */}
          <rect
            x={PAD} y={PAD}
            width={PLOT_W} height={PLOT_H}
            fill="var(--bg-muted)" stroke={GRAY_BORDER}
          />

          {/* X 轴、Y 轴网格线 */}
          {[-3, -2, -1, 0, 1, 2, 3].map((v) => {
            const sx = toSvgX(v);
            if (sx < PAD || sx > W - PAD) return null;
            return (
              <line
                key={`vg${v}`}
                x1={sx} y1={PAD} x2={sx} y2={H - PAD}
                stroke={v === 0 ? "var(--ink-faint)" : "var(--line)"}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : "3 3"}
              />
            );
          })}
          {yTickVals.map((v) => {
            const sy = toSvgY(v, yRange);
            if (sy < PAD || sy > H - PAD) return null;
            return (
              <line
                key={`hg${v}`}
                x1={PAD} y1={sy} x2={W - PAD} y2={sy}
                stroke={v === 0 ? "var(--ink-faint)" : "var(--line)"}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : "3 3"}
              />
            );
          })}

          {/* X 轴刻度标签 */}
          {[-3, 0, 3].map((v) => {
            const sx = toSvgX(v);
            return (
              <text key={`xl${v}`} x={sx} y={H - PAD + 13} fontSize={9}
                textAnchor="middle" fill="var(--ink-faint)">
                {v}
              </text>
            );
          })}

          {/* Y 轴刻度标签 */}
          {yTickVals.map((v) => {
            const sy = toSvgY(v, yRange);
            if (sy < PAD || sy > H - PAD) return null;
            return (
              <text key={`yl${v}`} x={PAD - 5} y={sy + 3} fontSize={9}
                textAnchor="end" fill="var(--ink-faint)">
                {v}
              </text>
            );
          })}

          {/* 轴标签 */}
          <text x={W / 2} y={H - 5} fontSize={10}
            textAnchor="middle" fill="var(--ink-faint)" fontStyle="italic">
            X
          </text>
          <text x={10} y={H / 2} fontSize={10}
            textAnchor="middle" fill="var(--ink-faint)" fontStyle="italic"
            transform={`rotate(-90, 10, ${H / 2})`}>
            Y
          </text>

          {/* 正态模式下：绘制示意椭圆（主轴方向代表相关结构）*/}
          {mode === "normal" && !isDegenerate && (
            <ellipse
              cx={W / 2} cy={H / 2}
              rx={PLOT_W / 2 * 0.72}
              ry={PLOT_H / 2 * 0.72 * Math.sqrt(Math.max(0.02, 1 - rho * rho))}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1.2}
              strokeDasharray="6 4"
              opacity={0.35}
              transform={`rotate(${-ellipseAngle}, ${W / 2}, ${H / 2})`}
            />
          )}

          {/* ρ=±1 时的退化直线 */}
          {isDegenerate && (
            <line
              x1={PAD} y1={rho > 0 ? H - PAD : PAD}
              x2={W - PAD} y2={rho > 0 ? PAD : H - PAD}
              stroke={ACCENT} strokeWidth={2.5} opacity={0.8}
            />
          )}

          {/* 散点 */}
          <g>
            {pointsReady &&
              points.map((p, i) => {
                const cx = toSvgX(Math.max(-DATA_RANGE, Math.min(DATA_RANGE, p.x)));
                const cy = toSvgY(
                  Math.max(-yRange, Math.min(yRange, p.y)),
                  yRange
                );
                if (cx < PAD || cx > W - PAD || cy < PAD || cy > H - PAD)
                  return null;
                return (
                  <circle
                    key={i}
                    cx={cx} cy={cy}
                    r={2.2}
                    fill={isDependent ? ORANGE : ACCENT}
                    opacity={0.45}
                  />
                );
              })}
          </g>

          {/* 四角极限标注：+1 / -1 的角度 */}
          {mode === "normal" && (
            <>
              <text x={W - PAD + 2} y={PAD - 4} fontSize={8} fill="var(--ink-faint)" textAnchor="end">
                ρ=+1 →直线
              </text>
              <text x={PAD} y={PAD - 4} fontSize={8} fill="var(--ink-faint)">
                ρ=−1 →直线
              </text>
            </>
          )}

          {/* Y=X² 标注 */}
          {isDependent && (
            <text
              x={W - PAD - 4} y={PAD + 16}
              fontSize={10} fill={ORANGE} textAnchor="end" fontStyle="italic"
            >
              Y = X² (抛物线)
            </text>
          )}
        </svg>
      </div>

      {/* 样本统计信息条 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "设定 ρ",
            val: isDependent ? "N/A" : (rho >= 0 ? "+" : "") + rho.toFixed(2),
            color: isDependent ? "var(--ink-soft)" : ACCENT,
            bg: isDependent ? "var(--bg-muted)" : ACCENT_LIGHT,
          },
          {
            label: "样本 r",
            val: (sampledCorr >= 0 ? "+" : "") + sampledCorr.toFixed(3),
            color: isDependent ? ORANGE : ACCENT,
            bg: isDependent ? ORANGE_LIGHT : ACCENT_LIGHT,
          },
          {
            label: "样本量 n",
            val: `${points.length}`,
            color: "var(--ink-soft)",
            bg: "var(--bg-muted)",
          },
        ].map(({ label, val, color, bg }) => (
          <div
            key={label}
            className="rounded-lg p-2.5 text-center"
            style={{ background: bg }}
          >
            <div className="text-[10px] text-[var(--ink-soft)]">{label}</div>
            <div
              className="text-[17px] font-extrabold font-mono mt-0.5"
              style={{ color }}
            >
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* 按钮区 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleResample}
          className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: ACCENT }}
        >
          重新采样
        </button>
        <button
          onClick={handleModeToggle}
          className={[
            "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all border",
            isDependent
              ? "text-white border-transparent"
              : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]",
          ].join(" ")}
          style={
            isDependent
              ? { background: ORANGE }
              : { background: "var(--bg-muted)" }
          }
        >
          {isDependent ? "返回：正态散点" : "展示：不相关但不独立（Y=X²）"}
        </button>
      </div>

      {/* 「不相关但不独立」专属说明 */}
      {isDependent && (
        <div
          className="rounded-lg border px-4 py-3 text-[12px] leading-relaxed space-y-1.5"
          style={{ borderColor: ORANGE, background: ORANGE_LIGHT }}
        >
          <div className="font-bold text-[13px]" style={{ color: ORANGE }}>
            反例：不相关 ≠ 独立！
          </div>
          <p className="text-[var(--ink-soft)]">
            上图中 Y = X²（加微小噪音），X 服从 N(0,1)。
            由于 X 与 X² 关于原点对称，协方差
            <span className="font-mono font-semibold text-[var(--ink)]"> Cov(X, X²) = E[X³] − E[X]·E[X²] = 0</span>，
            所以样本相关系数 r ≈ 0。
          </p>
          <p className="text-[var(--ink-soft)]">
            但 X 和 Y=X² 显然
            <b className="text-[var(--ink)]">高度相关</b>：知道 X，就能精确预测 Y！
            这揭示了相关系数只能度量<b className="text-[var(--ink)]">线性</b>关系，
            「ρ=0（不相关）」并不意味着「独立」。
          </p>
          <div
            className="mt-1 rounded-md px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: "#fef3c7", color: "#92400e" }}
          >
            口诀：独立 ⟹ 不相关；但不相关 ⇏ 独立
          </div>
        </div>
      )}

      {/* 正态模式下：知识点注释 */}
      {!isDependent && (
        <div className="rounded-lg bg-[var(--bg-muted)] border border-[var(--line)] px-4 py-3 text-[12px] text-[var(--ink-soft)] leading-relaxed space-y-1">
          <div className="font-semibold text-[13px] text-[var(--ink)]">
            几何直觉
          </div>
          <p>
            相关系数 ρ ∈ [−1, 1] 描述两个随机变量<b className="text-[var(--ink)]">线性关联</b>的强度与方向。
            散点云的形状近似一个椭圆——ρ=0 时椭圆轴对齐（圆形），ρ→±1 时椭圆退化为直线。
          </p>
          <p>
            公式：<span className="font-mono text-[var(--ink)]">ρ = Cov(X,Y) / (σ_X · σ_Y)</span>，
            是归一化的协方差，取值始终在 [−1, 1] 内。
          </p>
          <p>
            样本估计量 r 与 ρ 之间存在随机误差（n 越大越准），
            可多次点击「重新采样」观察 r 的波动范围。
          </p>
        </div>
      )}

      {/* 公式卡片 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5 text-[11px] text-[var(--ink-soft)]">
          <div className="font-semibold text-[12px] text-[var(--ink)] mb-1">协方差定义</div>
          <div className="font-mono leading-loose">
            Cov(X,Y) = E[(X−μ_X)(Y−μ_Y)]<br />
            {"           "}&nbsp;= E[XY] − E[X]·E[Y]
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5 text-[11px] text-[var(--ink-soft)]">
          <div className="font-semibold text-[12px] text-[var(--ink)] mb-1">皮尔逊相关系数</div>
          <div className="font-mono leading-loose">
            ρ(X,Y) = Cov(X,Y) / (σ_X·σ_Y)<br />
            样本 r = Σ(xᵢ−x̄)(yᵢ−ȳ) / √[Σ(xᵢ−x̄)²·Σ(yᵢ−ȳ)²]
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(CorrelationExplorerBase);