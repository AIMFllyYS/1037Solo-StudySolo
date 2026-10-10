// ─── 滑块子组件 ──────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  color: string;
}

export function SliderRow({ label, value, min, max, step, display, onChange, color }: SliderRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[12px] font-mono font-bold"
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
        className="w-full h-1.5 cursor-pointer"
        style={{ accentColor: color }}
      />
    </div>
  );
}

// ─── 数值展示卡 ───────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  color: string;
  bg: string;
}

export function StatCard({ label, value, color, bg }: StatCardProps) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: bg }}>
      <div className="text-[10px] leading-snug text-[var(--ink-soft)]">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}