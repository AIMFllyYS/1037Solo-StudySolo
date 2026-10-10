export const ACCENT = "var(--accent)";
export const COLOR_OK = "#22c55e";
export const COLOR_FAIL = "#ef4444";
export const COLOR_WIRE = "#6b7280";
export const COLOR_WIRE_OK = COLOR_OK;
export const COLOR_WIRE_FAIL = "#fca5a5";

export const SVG_W = 340;
export const SVG_H = 130;

// ─── 可靠度颜色 ─────────────────────────────────────────────────────────────

export function reliabilityColor(r: number): string {
  if (r >= 0.9) return COLOR_OK;
  if (r >= 0.6) return "#f59e0b";
  return COLOR_FAIL;
}