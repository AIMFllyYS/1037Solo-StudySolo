// ─── 辅助格式化 ──────────────────────────────────────────────────
export function fmt(v: number, d = 4): string {
  return isFinite(v) ? v.toFixed(d) : "—";
}

export function fmt3(v: number): string {
  return isFinite(v) ? v.toFixed(3) : "—";
}