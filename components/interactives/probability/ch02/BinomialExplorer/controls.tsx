// ─── 滑块子组件 ──────────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  color: string;
  bgColor: string;
  onChange: (v: number) => void;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  color,
  bgColor,
  onChange,
}: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded-md px-2 py-0.5 text-[13px] font-mono font-bold"
          style={{ background: bgColor, color }}
        >
          {displayValue}
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
      <div className="flex justify-between text-[10px] text-[var(--ink-soft)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ─── 统计数据卡片 ─────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  color: string;
  bg: string;
}

export function StatCard({ label, value, color, bg }: StatCardProps) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: bg }}>
      <div className="text-[11px] text-[var(--ink-soft)] leading-snug">{label}</div>
      <div
        className="mt-1 text-[18px] font-extrabold font-mono"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}