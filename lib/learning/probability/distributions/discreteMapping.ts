// ─── 类型定义 ─────────────────────────────────────────────────────────────────
export interface DieOutcome {
  face: number;   // 1–6，骰子点数
  xValue: number; // 用户指定的 X 值
}

export type PresetKey = "identity" | "oddEven" | "square" | "sign" | "custom";

export interface Preset {
  key: PresetKey;
  label: string;
  fn: (face: number) => number;
  description: string;
}

// ─── 预设变换 ─────────────────────────────────────────────────────────────────
export const PRESETS: Preset[] = [
  {
    key: "identity",
    label: "X = 点数",
    fn: (f) => f,
    description: "最简单：X 直接等于骰子点数，六个样本点映射到六个不同实数值。",
  },
  {
    key: "oddEven",
    label: "X = 奇偶",
    fn: (f) => (f % 2 === 1 ? 1 : 0),
    description: "X=1 表示奇数（1,3,5），X=0 表示偶数（2,4,6）。多对一映射，P(X=1)=P(X=0)=1/2。",
  },
  {
    key: "square",
    label: "X = 点数²",
    fn: (f) => f * f,
    description: "X = 点数的平方：1,4,9,16,25,36。每个值概率仍为 1/6，但值域分布极不均匀。",
  },
  {
    key: "sign",
    label: "X = ⌊点数/2⌋",
    fn: (f) => Math.floor(f / 2),
    description: "X 将 6 个点数压缩为 3 个值：0(点数1),1(点数2,3),2(点数4,5),3(点数6)。",
  },
  {
    key: "custom",
    label: "自定义",
    fn: (f) => f,
    description: "点击各样本点的数字输入框，自由设定 X 值，观察分布律变化。",
  },
];

export function getInitialOutcomes(presetFn: (f: number) => number): DieOutcome[] {
  return [1, 2, 3, 4, 5, 6].map((face) => ({
    face,
    xValue: presetFn(face),
  }));
}

// ─── 计算分布律 ───────────────────────────────────────────────────────────────
export interface DistEntry {
  xVal: number;
  faces: number[];
  prob: number; // = faces.length / 6
}

export function computeDistribution(outcomes: DieOutcome[]): DistEntry[] {
  const map = new Map<number, number[]>();
  for (const { face, xValue } of outcomes) {
    const existing = map.get(xValue);
    if (existing) {
      existing.push(face);
    } else {
      map.set(xValue, [face]);
    }
  }
  return Array.from(map.entries())
    .map(([xVal, faces]) => ({ xVal, faces, prob: faces.length / 6 }))
    .sort((a, b) => a.xVal - b.xVal);
}