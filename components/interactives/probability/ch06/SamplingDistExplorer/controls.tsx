// ─── 滑块组件 ────────────────────────────────────────────────────────────────
export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  bg: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export function SliderRow({ label, value, min, max, step, color, bg, onChange, format }: SliderRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded-md px-2 py-0.5 text-[12px] font-mono font-bold"
          style={{ background: bg, color }}
        >
          {format ? format(value) : value}
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
        style={{ accentColor: color }}
      />
      <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}