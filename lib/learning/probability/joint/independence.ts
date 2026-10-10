// ─── Types ───────────────────────────────────────────────────────────────────
export type Grid3x3 = [[number, number, number], [number, number, number], [number, number, number]];

// ─── Default joint distribution (independent example to start) ───────────────
// P(X=xi, Y=yj) = pi * qj where pi = [0.2, 0.5, 0.3] and qj = [0.3, 0.4, 0.3]
export const INIT_GRID: Grid3x3 = [
  [0.06, 0.08, 0.06],
  [0.15, 0.20, 0.15],
  [0.09, 0.12, 0.09],
];

// ─── Preset distributions ────────────────────────────────────────────────────
type Preset = { label: string; grid: Grid3x3; description: string };

export const PRESETS: Preset[] = [
  {
    label: "完全独立",
    description: "边缘分布乘积恰好等于联合概率，独立性指数 = 0",
    grid: [
      [0.06, 0.08, 0.06],
      [0.15, 0.20, 0.15],
      [0.09, 0.12, 0.09],
    ],
  },
  {
    label: "强相关",
    description: "概率集中在对角线，X 与 Y 高度正相关",
    grid: [
      [0.25, 0.05, 0.00],
      [0.05, 0.30, 0.05],
      [0.00, 0.05, 0.25],
    ],
  },
  {
    label: "负相关",
    description: "X 大时 Y 小，X 小时 Y 大，反对角线集中",
    grid: [
      [0.02, 0.06, 0.22],
      [0.06, 0.20, 0.04],
      [0.22, 0.04, 0.02],
    ],
  },
  {
    label: "边缘相同·不独立",
    description: "边缘分布均匀，但联合分布不是乘积",
    grid: [
      [0.02, 0.14, 0.17],
      [0.17, 0.08, 0.08],
      [0.14, 0.11, 0.09],
    ],
  },
];

// ─── Helper functions ─────────────────────────────────────────────────────────
export function computeMarginalsAndIndex(grid: Grid3x3): {
  rowMargins: [number, number, number];
  colMargins: [number, number, number];
  total: number;
  independent: Grid3x3;
  deviations: Grid3x3;
  maxDev: number;
} {
  // Row marginals (pi)
  const rowMargins: [number, number, number] = [
    grid[0][0] + grid[0][1] + grid[0][2],
    grid[1][0] + grid[1][1] + grid[1][2],
    grid[2][0] + grid[2][1] + grid[2][2],
  ];
  // Column marginals (qj)
  const colMargins: [number, number, number] = [
    grid[0][0] + grid[1][0] + grid[2][0],
    grid[0][1] + grid[1][1] + grid[2][1],
    grid[0][2] + grid[1][2] + grid[2][2],
  ];

  const total = rowMargins[0] + rowMargins[1] + rowMargins[2];

  // Independence reference: pi * qj (normalized)
  const normR: [number, number, number] = [
    total > 0 ? rowMargins[0] / total : 0,
    total > 0 ? rowMargins[1] / total : 0,
    total > 0 ? rowMargins[2] / total : 0,
  ];
  const normC: [number, number, number] = [
    total > 0 ? colMargins[0] / total : 0,
    total > 0 ? colMargins[1] / total : 0,
    total > 0 ? colMargins[2] / total : 0,
  ];

  const independent: Grid3x3 = [
    [normR[0] * normC[0], normR[0] * normC[1], normR[0] * normC[2]],
    [normR[1] * normC[0], normR[1] * normC[1], normR[1] * normC[2]],
    [normR[2] * normC[0], normR[2] * normC[1], normR[2] * normC[2]],
  ];

  // Normalized grid values for comparison
  const normGrid: Grid3x3 = [
    [
      total > 0 ? grid[0][0] / total : 0,
      total > 0 ? grid[0][1] / total : 0,
      total > 0 ? grid[0][2] / total : 0,
    ],
    [
      total > 0 ? grid[1][0] / total : 0,
      total > 0 ? grid[1][1] / total : 0,
      total > 0 ? grid[1][2] / total : 0,
    ],
    [
      total > 0 ? grid[2][0] / total : 0,
      total > 0 ? grid[2][1] / total : 0,
      total > 0 ? grid[2][2] / total : 0,
    ],
  ];

  // Deviations: p(xi,yj) - pi*qj
  const deviations: Grid3x3 = [
    [
      normGrid[0][0] - independent[0][0],
      normGrid[0][1] - independent[0][1],
      normGrid[0][2] - independent[0][2],
    ],
    [
      normGrid[1][0] - independent[1][0],
      normGrid[1][1] - independent[1][1],
      normGrid[1][2] - independent[1][2],
    ],
    [
      normGrid[2][0] - independent[2][0],
      normGrid[2][1] - independent[2][1],
      normGrid[2][2] - independent[2][2],
    ],
  ];

  const maxDev = Math.max(...deviations.flat().map(Math.abs));

  return { rowMargins, colMargins, total, independent, deviations, maxDev };
}