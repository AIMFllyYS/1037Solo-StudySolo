import { ACCENT, ACCENT_LIGHT } from "./appearance";
// ─── 滑块子组件 ───────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  color?: string;
}

export function SliderRow({ label, value, min, max, step, fmt, onChange, color }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[12px] font-semibold text-[var(--ink)]">{label}</span>
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
        className="w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: ACCENT_LIGHT, color: color ?? ACCENT }}
      >
        {fmt(value)}
      </span>
    </div>
  );
}