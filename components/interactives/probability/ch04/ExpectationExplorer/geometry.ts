import { X_LEFT, X_MIN_VAL, X_MAX_VAL, X_RANGE, BAR_MAX_H, BAR_BOTTOM } from "./appearance";
export type DragTarget =
  | { kind: "x"; idx: number; startSvgX: number; startX: number }
  | { kind: "p"; idx: number; startSvgY: number; startP: number };

// ─── 坐标转换 ─────────────────────────────────────────────────────────────────
export function valToSvgX(x: number): number {
  return X_LEFT + ((x - X_MIN_VAL) / (X_MAX_VAL - X_MIN_VAL)) * X_RANGE;
}

export function svgXToVal(svgX: number): number {
  const raw = ((svgX - X_LEFT) / X_RANGE) * (X_MAX_VAL - X_MIN_VAL) + X_MIN_VAL;
  return Math.round(Math.min(X_MAX_VAL, Math.max(X_MIN_VAL, raw)));
}

export function probToBarH(p: number): number {
  return p * BAR_MAX_H;
}

export function svgYToProb(svgY: number): number {
  const h = BAR_BOTTOM - svgY;
  return Math.min(0.99, Math.max(0.01, h / BAR_MAX_H));
}