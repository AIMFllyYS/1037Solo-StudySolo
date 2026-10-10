/** Align a submenu to the row that owns it; clamp only when the viewport requires it. */
export function submenuTop(rowTop: number, menuHeight: number, viewportTop: number, viewportHeight: number): number {
  const min = viewportTop + 8;
  const max = Math.max(min, viewportTop + viewportHeight - menuHeight - 8);
  return Math.max(min, Math.min(rowTop, max));
}
