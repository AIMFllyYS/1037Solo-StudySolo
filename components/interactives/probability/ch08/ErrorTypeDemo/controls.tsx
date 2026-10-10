// ─── 滑块子组件 ──────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  color: string;
  onChange: (v: number) => void;
  hint?: string;
}

export function SliderRow({ label, value, min, max, step, display, color, onChange, hint }: SliderRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded px-2 py-0.5 text-[12px] font-mono font-bold"
          style={{ background: color + "22", color }}
        >
          {display}
        </span>
      </div>
      {hint && <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">{hint}</p>}
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

// ─── 统计数值卡片 ─────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}

export function StatCard({ label, value, sub, color, bg }: StatCardProps) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: bg }}>
      <div className="text-[10px] leading-snug text-[var(--ink-soft)]">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--ink-soft)]">{sub}</div>}
    </div>
  );
}