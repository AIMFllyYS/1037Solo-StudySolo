import { GREEN, YELLOW, RED, GREEN_LIGHT, YELLOW_LIGHT, RED_LIGHT } from "./appearance";
import { fmt, fmtShort } from "./formatters";
// ─── Independence Gauge ───────────────────────────────────────────────────────
export function IndependenceGauge({ maxDev }: { maxDev: number }) {
  const capped = Math.min(maxDev, 0.25);
  const pct = capped / 0.25;
  const gaugeColor =
    maxDev < 0.01
      ? GREEN
      : maxDev < 0.05
      ? YELLOW
      : RED;
  const gaugeLabel =
    maxDev < 0.005
      ? "几乎完全独立"
      : maxDev < 0.02
      ? "近似独立"
      : maxDev < 0.07
      ? "弱相关"
      : "强相关（不独立）";

  return (
    <div className="rounded-lg border border-[var(--line)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[var(--ink)]">独立性指数</span>
        <span
          className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
          style={{
            background: maxDev < 0.01 ? GREEN_LIGHT : maxDev < 0.05 ? YELLOW_LIGHT : RED_LIGHT,
            color: gaugeColor,
          }}
        >
          {fmt(maxDev)}
        </span>
      </div>
      <div className="text-[11px] font-mono text-[var(--ink-soft)]">
        max |p(xᵢ,yⱼ) − pᵢ·qⱼ| = {fmt(maxDev)}
      </div>
      {/* Gauge bar */}
      <div className="relative h-4 w-full rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct * 100}%`, background: gaugeColor }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
        <span style={{ color: GREEN }}>0 = 完全独立</span>
        <span style={{ color: RED }}>≥ 0.25 = 强相关</span>
      </div>
      <div
        className="text-center text-[12px] font-semibold rounded-md py-1"
        style={{
          background: maxDev < 0.01 ? GREEN_LIGHT : maxDev < 0.05 ? YELLOW_LIGHT : RED_LIGHT,
          color: gaugeColor,
        }}
      >
        {gaugeLabel}
      </div>
    </div>
  );
}

// ─── Marginal display ─────────────────────────────────────────────────────────
export function MarginalBadge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="rounded-md px-2 py-1 text-center"
      style={{ background: color + "22", minWidth: 54 }}
    >
      <div className="text-[9px] text-[var(--ink-soft)]">{label}</div>
      <div className="text-[12px] font-mono font-bold" style={{ color }}>
        {fmtShort(value)}
      </div>
    </div>
  );
}