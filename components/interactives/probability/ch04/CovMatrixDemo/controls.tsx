import { ACCENT } from "./appearance";
// ─── 滑块组件 ─────────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  symbol: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color?: string;
  fmt?: (v: number) => string;
}

export function SliderRow({ label, symbol, value, min, max, step, onChange, color, fmt }: SliderRowProps) {
  const display = fmt ? fmt(value) : value.toFixed(2);
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[12px] text-[var(--ink-soft)]">{label}</span>
      <span
        className="w-8 shrink-0 text-right text-[11px] font-mono font-semibold"
        style={{ color: color ?? ACCENT }}
      >
        {symbol}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 cursor-pointer"
        style={{ accentColor: color ?? ACCENT }}
      />
      <span
        className="w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: (color ?? ACCENT) + "18", color: color ?? ACCENT }}
      >
        {display}
      </span>
    </div>
  );
}