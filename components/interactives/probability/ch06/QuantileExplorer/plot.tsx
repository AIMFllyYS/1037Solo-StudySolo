import { SVG_W, PAD, SVG_H, DIST_META, GRAY_BG, GRAY_LINE } from "./appearance";
import type { Distribution, QQPoint } from "@/lib/learning/probability/sampling/quantiles";
function plotW() { return SVG_W - PAD.left - PAD.right; }
function plotH() { return SVG_H - PAD.top - PAD.bottom; }

function scaleX(v: number, lo: number, hi: number): number {
  return PAD.left + ((v - lo) / (hi - lo)) * plotW();
}
function scaleY(v: number, lo: number, hi: number): number {
  return PAD.top + plotH() - ((v - lo) / (hi - lo)) * plotH();
}

// ─── 柱状图（排序后样本可视化） ──────────────────────────────────────────────

export function SortedBar({
  sorted,
  dist,
  hoveredIdx,
  onHover,
}: {
  sorted: number[];
  dist: Distribution;
  hoveredIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  const n = sorted.length;
  if (n === 0) return <div className="h-16 flex items-center justify-center text-[12px] text-[var(--ink-soft)]">点击「重新抽样」开始</div>;

  const lo = sorted[0];
  const hi = sorted[n - 1];
  const range = hi - lo || 1;
  const color = DIST_META[dist].color;

  // 只显示最多 80 根竖线，太多会糊
  const stride = Math.max(1, Math.floor(n / 80));
  const bars: { i: number; v: number }[] = [];
  for (let i = 0; i < n; i += stride) bars.push({ i, v: sorted[i] });

  return (
    <div className="relative" style={{ height: 52 }}>
      <div className="absolute inset-0 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] overflow-hidden">
        {bars.map(({ i, v }) => {
          const heightPct = ((v - lo) / range) * 100;
          const leftPct = (i / (n - 1 || 1)) * 100;
          const isHov = hoveredIdx !== null && Math.abs(i - hoveredIdx) <= stride;
          return (
            <div
              key={i}
              className="absolute bottom-0 transition-opacity"
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(1, 100 / bars.length - 0.3)}%`,
                height: `${Math.max(4, heightPct)}%`,
                background: color,
                opacity: isHov ? 1 : 0.55,
                minHeight: 2,
              }}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
      </div>
      {/* 标注 */}
      <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[10px] text-[var(--ink-soft)] px-1">
        <span>x₍₁₎ = {lo.toFixed(3)}</span>
        <span className="font-semibold text-[var(--ink)]">顺序统计量</span>
        <span>x₍ₙ₎ = {hi.toFixed(3)}</span>
      </div>
    </div>
  );
}

// ─── Q-Q 图 ───────────────────────────────────────────────────────────────────

export function QQPlot({
  points,
  dist,
  hoveredIdx,
  onHover,
}: {
  points: QQPoint[];
  dist: Distribution;
  hoveredIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  const color = DIST_META[dist].color;

  const allX = points.map((p) => p.theoretical);
  const allY = points.map((p) => p.sample);

  const lo = Math.min(-2.5, Math.min(...allX), Math.min(...allY));
  const hi = Math.max(2.5, Math.max(...allX), Math.max(...allY));

  const xTicks = [-2, -1, 0, 1, 2];
  const yTicks = [-2, -1, 0, 1, 2];

  const hov = hoveredIdx !== null && points[hoveredIdx];

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full rounded-lg border border-[var(--line)]"
      style={{ background: GRAY_BG }}
      onMouseLeave={() => onHover(null)}
    >
      {/* 网格 */}
      {xTicks.map((t) => (
        <line
          key={`vg${t}`}
          x1={scaleX(t, lo, hi)}
          y1={PAD.top}
          x2={scaleX(t, lo, hi)}
          y2={PAD.top + plotH()}
          stroke={GRAY_LINE}
          strokeWidth={1}
        />
      ))}
      {yTicks.map((t) => (
        <line
          key={`hg${t}`}
          x1={PAD.left}
          y1={scaleY(t, lo, hi)}
          x2={PAD.left + plotW()}
          y2={scaleY(t, lo, hi)}
          stroke={GRAY_LINE}
          strokeWidth={1}
        />
      ))}

      {/* 参考对角线 y=x */}
      <line
        x1={scaleX(lo, lo, hi)}
        y1={scaleY(lo, lo, hi)}
        x2={scaleX(hi, lo, hi)}
        y2={scaleY(hi, lo, hi)}
        stroke="var(--ink-faint)"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      <text
        x={scaleX(hi, lo, hi) - 4}
        y={scaleY(hi, lo, hi) + 12}
        fontSize={9}
        fill="var(--ink-faint)"
        textAnchor="end"
      >
        y=x
      </text>

      {/* 散点 */}
      {points.map((pt, i) => {
        const cx = scaleX(pt.theoretical, lo, hi);
        const cy = scaleY(pt.sample, lo, hi);
        const isHov = i === hoveredIdx;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={isHov ? 5 : points.length > 60 ? 2.5 : 3.5}
            fill={color}
            opacity={isHov ? 1 : 0.65}
            stroke={isHov ? "white" : "none"}
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onHover(i)}
          />
        );
      })}

      {/* Hover 详情 */}
      {hov && (
        <g>
          <line
            x1={scaleX(hov.theoretical, lo, hi)}
            y1={PAD.top}
            x2={scaleX(hov.theoretical, lo, hi)}
            y2={PAD.top + plotH()}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.6}
          />
          <line
            x1={PAD.left}
            y1={scaleY(hov.sample, lo, hi)}
            x2={PAD.left + plotW()}
            y2={scaleY(hov.sample, lo, hi)}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.6}
          />
          {/* Tooltip */}
          {(() => {
            const tx = scaleX(hov.theoretical, lo, hi);
            const ty = scaleY(hov.sample, lo, hi);
            const boxW = 108, boxH = 38;
            const bx = Math.min(tx + 8, PAD.left + plotW() - boxW - 4);
            const by = Math.max(PAD.top + 4, ty - boxH - 4);
            return (
              <g>
                <rect x={bx} y={by} width={boxW} height={boxH} rx={5} fill="var(--bg-elevated)" stroke={color} strokeWidth={1} />
                <text x={bx + 6} y={by + 14} fontSize={10} fill={color} fontWeight="700">
                  x₍{hov.rank}₎  理论: {hov.theoretical.toFixed(3)}
                </text>
                <text x={bx + 6} y={by + 28} fontSize={10} fill="var(--ink-soft)">
                  样本 Z: {hov.sample.toFixed(3)}
                </text>
              </g>
            );
          })()}
        </g>
      )}

      {/* 坐标轴 */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH()} stroke="var(--line)" strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top + plotH()} x2={PAD.left + plotW()} y2={PAD.top + plotH()} stroke="var(--line)" strokeWidth={1.5} />

      {/* X 轴刻度 */}
      {xTicks.map((t) => (
        <g key={`xt${t}`}>
          <line
            x1={scaleX(t, lo, hi)} y1={PAD.top + plotH()}
            x2={scaleX(t, lo, hi)} y2={PAD.top + plotH() + 4}
            stroke="var(--line)" strokeWidth={1}
          />
          <text x={scaleX(t, lo, hi)} y={PAD.top + plotH() + 14} fontSize={9} textAnchor="middle" fill="var(--ink-soft)">
            {t}
          </text>
        </g>
      ))}

      {/* Y 轴刻度 */}
      {yTicks.map((t) => (
        <g key={`yt${t}`}>
          <line
            x1={PAD.left - 4} y1={scaleY(t, lo, hi)}
            x2={PAD.left} y2={scaleY(t, lo, hi)}
            stroke="var(--line)" strokeWidth={1}
          />
          <text x={PAD.left - 6} y={scaleY(t, lo, hi) + 3} fontSize={9} textAnchor="end" fill="var(--ink-soft)">
            {t}
          </text>
        </g>
      ))}

      {/* 轴标签 */}
      <text
        x={PAD.left + plotW() / 2}
        y={SVG_H - 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-soft)"
        fontWeight="600"
      >
        理论正态分位数
      </text>
      <text
        x={10}
        y={PAD.top + plotH() / 2}
        fontSize={10}
        textAnchor="middle"
        fill="var(--ink-soft)"
        fontWeight="600"
        transform={`rotate(-90, 10, ${PAD.top + plotH() / 2})`}
      >
        样本分位数 (Z)
      </text>
    </svg>
  );
}