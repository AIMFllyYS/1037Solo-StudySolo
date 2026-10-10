import { useCallback } from "react";
import { deviationBg, ACCENT, deviationColor, GREEN } from "./appearance";
import { fmt, fmtShort } from "./formatters";
// ─── Cell Editor ──────────────────────────────────────────────────────────────
interface CellEditorProps {
  value: number;
  dev: number;
  maxDev: number;
  isSelected: boolean;
  onClick: () => void;
  onChange: (v: number) => void;
  row: number;
  col: number;
  independent: number;
}

export function CellEditor({ value, dev, maxDev, isSelected, onClick, onChange, row, col, independent }: CellEditorProps) {
  const bg = deviationBg(dev, maxDev);
  const borderColor = isSelected ? ACCENT : deviationColor(dev, maxDev);
  const textColor = deviationColor(dev, maxDev);
  const absDev = Math.abs(dev);
  const isClose = absDev < 0.002;

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-lg p-1.5 cursor-pointer transition-all duration-200"
      style={{
        background: bg,
        border: `2px solid ${borderColor}`,
        minHeight: 64,
        boxShadow: isSelected ? `0 0 0 3px ${ACCENT}44` : undefined,
      }}
      onClick={onClick}
      title={`X=${row + 1}, Y=${col + 1} | 实际: ${fmt(value)} | 独立参考: ${fmt(independent)} | 偏差: ${dev >= 0 ? "+" : ""}${fmt(dev)}`}
    >
      <div
        className="text-[11px] font-bold leading-tight"
        style={{ color: isClose ? GREEN : textColor }}
      >
        {isClose ? "OK" : (dev > 0 ? "↑" : "↓")}
      </div>
      <div
        className="text-[13px] font-mono font-bold"
        style={{ color: textColor }}
      >
        {fmtShort(value)}
      </div>
      {isSelected && (
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.001}
          value={value}
          onChange={handleSliderChange}
          onClick={(e) => e.stopPropagation()}
          className="w-full mt-1"
          style={{ accentColor: ACCENT, height: 14 }}
        />
      )}
    </div>
  );
}