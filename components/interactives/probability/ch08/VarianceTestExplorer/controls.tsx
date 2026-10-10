import { ACCENT } from "./appearance";
// ─── Numeric input component ─────────────────────────────────────────────────
export interface NumInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}

export function NumInput({ label, value, min, max, step, onChange, unit }: NumInputProps) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[12px] font-semibold text-[var(--ink)]">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-1 text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
        />
        {unit && (
          <span className="text-[11px] text-[var(--ink-soft)] whitespace-nowrap">{unit}</span>
        )}
      </div>
    </div>
  );
}

// ─── Slider component ─────────────────────────────────────────────────────────
export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  color?: string;
}

export function Slider({ label, value, min, max, step, onChange, fmt, color }: SliderProps) {
  const display = fmt ? fmt(value) : String(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded px-2 py-0.5 text-[12px] font-mono font-bold"
          style={{ background: (color ?? ACCENT) + "22", color: color ?? ACCENT }}
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
        style={{ accentColor: color ?? ACCENT }}
      />
    </div>
  );
}