// ─── Design constants ────────────────────────────────────────────────────────
export const ACCENT = "#5b46e5";
export const ACCENT_LIGHT = "#ede9fe";
export const GREEN = "#0f766e";
export const GREEN_LIGHT = "#d1fae5";
export const RED = "#dc2626";
export const RED_LIGHT = "#fee2e2";
export const YELLOW = "#b45309";
export const YELLOW_LIGHT = "#fef3c7";

// Interpolate color from green (0 deviation) -> yellow -> red (max deviation)
export function deviationColor(dev: number, maxDev: number): string {
  if (maxDev < 1e-9) return "#e8f5e9"; // all-green when perfectly independent
  const ratio = Math.min(Math.abs(dev) / Math.max(maxDev, 0.001), 1);
  // red channel: 0->0x0f(green-dark), 1->0xdc(red)
  const r = Math.round(15 + (220 - 15) * ratio);
  const g = Math.round(118 - (118 - 38) * ratio);
  const b = Math.round(110 - 110 * ratio);
  return `rgb(${r},${g},${b})`;
}

export function deviationBg(dev: number, maxDev: number): string {
  if (maxDev < 1e-9) return "#f0fdf4";
  const ratio = Math.min(Math.abs(dev) / Math.max(maxDev, 0.001), 1);
  const r = Math.round(240 + (254 - 240) * ratio);
  const g = Math.round(253 + (226 - 253) * ratio);
  const b = Math.round(244 + (226 - 244) * ratio);
  return `rgb(${r},${g},${b})`;
}