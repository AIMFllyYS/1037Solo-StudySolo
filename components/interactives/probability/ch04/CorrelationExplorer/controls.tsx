import { ACCENT, ORANGE, ACCENT_LIGHT } from "./appearance";
// ─── 滑块子组件 ──────────────────────────────────────────────────────────────
interface RhoSliderProps {
  value: number;
  onChange: (v: number) => void;
}

export function RhoSlider({ value, onChange }: RhoSliderProps) {
  const label = value.toFixed(2);
  const labelColor =
    value > 0.5
      ? ACCENT
      : value < -0.5
      ? ORANGE
      : "var(--ink-soft)";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">
          相关系数 ρ（rho）
        </span>
        <span
          className="rounded-md px-2.5 py-0.5 text-[14px] font-mono font-bold"
          style={{ background: ACCENT_LIGHT, color: labelColor }}
        >
          {value >= 0 ? "+" : ""}{label}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 cursor-pointer rounded-full appearance-none"
          style={{ accentColor: ACCENT }}
        />
        <div className="flex justify-between text-[10px] text-[var(--ink-soft)] mt-1">
          <span>−1（完全负相关）</span>
          <span>0</span>
          <span>+1（完全正相关）</span>
        </div>
      </div>
    </div>
  );
}