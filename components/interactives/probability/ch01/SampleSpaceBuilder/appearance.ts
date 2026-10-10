import type { DiceFace, Membership } from "@/lib/learning/probability/foundations/sampleSpace";
export const DICE_DOTS: Record<DiceFace, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

export const ACCENT = "#5b46e5";
export const A_COLOR = "#7c3aed";
export const B_COLOR = "#0f766e";
export const BOTH_COLOR = "#b45309";
export const NONE_COLOR = "var(--ink-faint)";

export const MEMBERSHIP_LABEL: Record<Membership, string> = {
  none: "∉ A,B",
  A: "∈ A",
  B: "∈ B",
  AB: "∈ A∩B",
};

export const MEMBERSHIP_COLORS: Record<Membership, string> = {
  none: NONE_COLOR,
  A: A_COLOR,
  B: B_COLOR,
  AB: BOTH_COLOR,
};