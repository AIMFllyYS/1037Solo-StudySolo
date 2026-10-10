// ─── 初始分布（3×3，行=X 取值，列=Y 取值）────────────────────────────────────
export const INITIAL_RAW: number[][] = [
  [0.10, 0.08, 0.06],
  [0.12, 0.18, 0.10],
  [0.08, 0.14, 0.14],
];

// 行列标签
export const X_LABELS = ["x₁", "x₂", "x₃"];
export const Y_LABELS = ["y₁", "y₂", "y₃"];

// ─── 工具函数 ────────────────────────────────────────────────────────────────
export function normalize(raw: number[][]): number[][] {
  let sum = 0;
  for (const row of raw) for (const v of row) sum += Math.max(0, v);
  if (sum === 0) {
    return raw.map((row) => row.map(() => 1 / 9));
  }
  return raw.map((row) => row.map((v) => Math.max(0, v) / sum));
}

// ─── 随机生成一组分布 ────────────────────────────────────────────────────────
export function randomRaw(): number[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => Math.random())
  );
}

// ─── 预设场景 ────────────────────────────────────────────────────────────────
export type PresetKey = "custom" | "uniform" | "diag" | "corner";

export const PRESETS: Record<PresetKey, { label: string; raw: number[][] | null }> = {
  uniform: {
    label: "均匀分布",
    raw: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  },
  diag: {
    label: "对角线（X=Y 相关）",
    raw: [[9, 1, 0], [1, 9, 1], [0, 1, 9]],
  },
  corner: {
    label: "角落集中",
    raw: [[8, 1, 1], [1, 1, 1], [1, 1, 6]],
  },
  custom: { label: "自定义", raw: null },
};