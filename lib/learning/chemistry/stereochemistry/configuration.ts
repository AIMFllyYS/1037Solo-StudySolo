/* ============================================================
 * R/S 构型判定 — 内置手性碳实例
 * 顺序规则（CIP）：按取代基中第一个原子的原子序数排优先级，
 * 数值越大优先级越高。把最小基团 d 朝后，看 a→b→c：
 * 顺时针 = R，逆时针 = S。
 * ============================================================ */

export type Config = "R" | "S";

interface Substituent {
  /** 取代基显示名（含化学式） */
  label: string;
  /** 用于排序说明的"首原子"提示 */
  firstAtom: string;
  /** 首原子原子序数（CIP 排序依据，越大越优先） */
  atomicNumber: number;
}

interface ChiralExample {
  id: string;
  /** 分子名称 */
  name: string;
  /** 手性碳描述 */
  centerLabel: string;
  /** 四个取代基（无序，组件内部按 atomicNumber 排序得到 a>b>c>d） */
  substituents: [Substituent, Substituent, Substituent, Substituent];
  /** 正确构型 */
  answer: Config;
  /** 一句话说明排序与构型由来 */
  note: string;
}

export const EXAMPLES: ChiralExample[] = [
  {
    id: "glyceraldehyde",
    name: "D-甘油醛 (D-glyceraldehyde)",
    centerLabel: "C2 手性碳",
    substituents: [
      { label: "—OH", firstAtom: "O", atomicNumber: 8 },
      { label: "—CHO (醛基)", firstAtom: "C", atomicNumber: 6 },
      { label: "—CH₂OH", firstAtom: "C", atomicNumber: 6 },
      { label: "—H", firstAtom: "H", atomicNumber: 1 },
    ],
    answer: "R",
    note: "OH(O=8) 最高；CHO 与 CH₂OH 首原子同为 C，比较其连接原子：CHO 接 (O,O,H) 高于 CH₂OH 接 (O,H,H)，故 CHO>CH₂OH；H 最低。D-甘油醛构型为 R。",
  },
  {
    id: "lactic-acid",
    name: "L-乳酸 (L-lactic acid)",
    centerLabel: "C2 手性碳",
    substituents: [
      { label: "—OH", firstAtom: "O", atomicNumber: 8 },
      { label: "—COOH (羧基)", firstAtom: "C", atomicNumber: 6 },
      { label: "—CH₃", firstAtom: "C", atomicNumber: 6 },
      { label: "—H", firstAtom: "H", atomicNumber: 1 },
    ],
    answer: "S",
    note: "OH(O=8) 最高；COOH 与 CH₃ 首原子同为 C，COOH 接 (O,O,O) 远高于 CH₃ 接 (H,H,H)，故 COOH>CH₃；H 最低。L-乳酸构型为 S。",
  },
  {
    id: "bromochlorofluoromethane",
    name: "溴氯氟甲烷 (CHBrClF)",
    centerLabel: "中心 C 手性碳",
    substituents: [
      { label: "—Br", firstAtom: "Br", atomicNumber: 35 },
      { label: "—Cl", firstAtom: "Cl", atomicNumber: 17 },
      { label: "—F", firstAtom: "F", atomicNumber: 9 },
      { label: "—H", firstAtom: "H", atomicNumber: 1 },
    ],
    answer: "R",
    note: "四个取代基首原子各不相同，直接按原子序数排：Br(35)>Cl(17)>F(9)>H(1)。此处展示的对映体 a→b→c 顺时针，构型为 R。",
  },
  {
    id: "bromochloroiodomethane",
    name: "溴氯碘甲烷 (CHBrClI)",
    centerLabel: "中心 C 手性碳",
    substituents: [
      { label: "—I", firstAtom: "I", atomicNumber: 53 },
      { label: "—Br", firstAtom: "Br", atomicNumber: 35 },
      { label: "—Cl", firstAtom: "Cl", atomicNumber: 17 },
      { label: "—H", firstAtom: "H", atomicNumber: 1 },
    ],
    answer: "S",
    note: "首原子各异，按原子序数排：I(53)>Br(35)>Cl(17)>H(1)。此处展示的对映体 a→b→c 逆时针，构型为 S。",
  },
];

/** 取代基按 CIP 优先级降序排列（a>b>c>d） */
export function rankedSubstituents(ex: ChiralExample): Substituent[] {
  return [...ex.substituents].sort((x, y) => y.atomicNumber - x.atomicNumber);
}