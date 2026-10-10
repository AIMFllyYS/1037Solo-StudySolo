// ─── 场景定义 ────────────────────────────────────────────────────────────────

export type SceneKey = "dice" | "balls";

interface OutcomeGroup {
  label: string;    // 展示标签，如 "和=7"
  count: number;    // 有利结果数
  total: number;    // 总等可能结果数
  color: string;    // 柱色
}

export interface SceneDef {
  key: SceneKey;
  name: string;
  description: string;
  outcomes: OutcomeGroup[];
  targetLabel: string; // 有利事件名称
}

// 掷两骰子之和：总样本数 36，各和的理论计数
export function diceOutcomes(targetSum: number): SceneDef {
  const counts: Record<number, number> = {};
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) {
      const s = a + b;
      counts[s] = (counts[s] ?? 0) + 1;
    }
  const total = 36;
  const groups: OutcomeGroup[] = Array.from({ length: 11 }, (_, i) => {
    const s = i + 2;
    return {
      label: String(s),
      count: counts[s] ?? 0,
      total,
      color: s === targetSum ? "#5b46e5" : "#c4b5fd",
    };
  });
  return {
    key: "dice",
    name: "掷两骰子之和",
    description: `两颗公平骰子，样本空间共 36 个等可能点。选定一个目标"和"，观察该和出现的理论概率与试验频率是否趋近。`,
    outcomes: groups,
    targetLabel: `和 = ${targetSum}`,
  };
}

// 摸球：n 球含 k 红球，无放回摸 1 球，有利事件=摸到红球
export function ballsOutcomes(n: number, k: number): SceneDef {
  return {
    key: "balls",
    name: "摸球",
    description: `袋中共 ${n} 球，其中 ${k} 个红球、${n - k} 个白球。随机摸 1 球（等可能），有利事件为摸到红球。`,
    outcomes: [
      { label: "红球", count: k, total: n, color: "#5b46e5" },
      { label: "白球", count: n - k, total: n, color: "#c4b5fd" },
    ],
    targetLabel: "摸到红球",
  };
}

// ─── 模拟函数 ─────────────────────────────────────────────────────────────────

export function simulateDice(runs: number, targetSum: number): number {
  let hits = 0;
  for (let i = 0; i < runs; i++) {
    const a = Math.floor(Math.random() * 6) + 1;
    const b = Math.floor(Math.random() * 6) + 1;
    if (a + b === targetSum) hits++;
  }
  return hits;
}

export function simulateBalls(runs: number, n: number, k: number): number {
  let hits = 0;
  for (let i = 0; i < runs; i++) {
    // 等可能选 0..n-1，前 k 个为红球
    if (Math.floor(Math.random() * n) < k) hits++;
  }
  return hits;
}