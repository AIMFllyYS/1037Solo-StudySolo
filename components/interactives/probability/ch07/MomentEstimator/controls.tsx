// ─── 滑块子组件 ──────────────────────────────────────────────────
export interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
}

export function ParamSlider({ label, value, min, max, step, onChange, color }: ParamSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[12px] font-semibold text-[var(--ink)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 cursor-pointer"
        style={{ accentColor: color }}
      />
      <span
        className="w-14 shrink-0 rounded-md px-2 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: color + "22", color }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}