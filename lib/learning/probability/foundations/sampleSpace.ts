// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────
export type DiceFace = 1 | 2 | 3 | 4 | 5 | 6;
export type Membership = "none" | "A" | "B" | "AB";

export interface OutcomeState {
  face: DiceFace;
  membership: Membership;
}

// ─────────────────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_FACES: DiceFace[] = [1, 2, 3, 4, 5, 6];

export const MEMBERSHIP_CYCLE: Record<Membership, Membership> = {
  none: "A",
  A: "B",
  B: "AB",
  AB: "none",
};