// ─── 常量与类型 ─────────────────────────────────────────────────────────────

export type Mode = "series" | "parallel";

export interface Component {
  id: number;
  label: string;
  p: number; // 可靠度 0..1
}

export const INIT_COMPONENTS: Component[] = [
  { id: 1, label: "A", p: 0.9 },
  { id: 2, label: "B", p: 0.8 },
  { id: 3, label: "C", p: 0.75 },
];

// ─── 纯函数：计算系统可靠度 ─────────────────────────────────────────────────

export function calcSeries(ps: number[]): number {
  return ps.reduce((acc, p) => acc * p, 1);
}

export function calcParallel(ps: number[]): number {
  return 1 - ps.reduce((acc, p) => acc * (1 - p), 1);
}