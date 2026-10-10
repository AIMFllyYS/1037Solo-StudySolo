// ─── 格式化辅助 ──────────────────────────────────────────────

export function fmtPct(v: number): string {
  if (v >= 1) return "100.00%";
  if (v < 0.0001) return "< 0.01%";
  return (v * 100).toFixed(2) + "%";
}