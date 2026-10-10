// ─── 滑块子组件 ────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  color: string;
  onChange: (v: number) => void;
}

export function SliderRow({ label, value, min, max, step, display, color, onChange }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-[12px] font-semibold text-[var(--ink)] shrink-0">{label}</span>
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
        className="w-12 rounded-md px-1.5 py-0.5 text-center text-[12px] font-mono font-bold shrink-0"
        style={{ background: color + "22", color }}
      >
        {display}
      </span>
    </div>
  );
}