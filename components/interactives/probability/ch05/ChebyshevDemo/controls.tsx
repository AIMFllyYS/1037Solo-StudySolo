import { BOUND_COLOR, MID_COLOR } from "./appearance";
// ─── 滑块子组件 ──────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  color: string;
  onChange: (v: number) => void;
}

export function SliderRow({ label, sub, value, min, max, step, display, color, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>
          <span className="ml-1.5 text-[11px] text-[var(--ink-soft)]">{sub}</span>
        </div>
        <span
          className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
          style={{ background: color + "22", color }}
        >
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 cursor-pointer rounded-full"
        style={{ accentColor: color }}
      />
    </div>
  );
}

// ─── 数值行组件 ──────────────────────────────────────────────
interface MetricRowProps {
  label: string;
  formula: string;
  value: string;
  color: string;
  bg: string;
  isRatio?: boolean;
  ratio?: number;
}

export function MetricRow({ label, formula, value, color, bg, isRatio, ratio }: MetricRowProps) {
  // 比值越大 = 不等式越松（红色），比值越接近 1 = 越紧（绿色）
  const tightnessLabel =
    isRatio && ratio !== undefined
      ? ratio >= 100
        ? "极松"
        : ratio >= 10
        ? "很松"
        : ratio >= 3
        ? "较松"
        : ratio >= 1.5
        ? "稍松"
        : "接近紧"
      : null;

  const tightnessColor =
    ratio !== undefined
      ? ratio >= 10
        ? BOUND_COLOR
        : ratio >= 3
        ? "#ea580c"
        : ratio >= 1.5
        ? "#ca8a04"
        : MID_COLOR
      : undefined;

  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{ background: bg }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-[var(--ink)]">{label}</div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-soft)]">{formula}</div>
      </div>
      <div className="ml-3 flex flex-col items-end">
        <span className="font-mono text-[15px] font-bold" style={{ color }}>
          {value}
        </span>
        {tightnessLabel && tightnessColor && (
          <span className="mt-0.5 text-[10px] font-semibold" style={{ color: tightnessColor }}>
            {tightnessLabel}
          </span>
        )}
      </div>
    </div>
  );
}