import { ACCENT_LIGHT, ACCENT } from "./appearance";
// ─── 滑块子组件 ───────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

export function SliderRow({ label, value, display, min, max, step, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
          style={{ background: ACCENT_LIGHT, color: ACCENT }}
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
        className="w-full h-1.5 cursor-pointer"
        style={{ accentColor: ACCENT }}
      />
    </div>
  );
}