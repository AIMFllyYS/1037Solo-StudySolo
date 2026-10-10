import type { TestType } from "@/lib/learning/probability/testing/normalHypothesis";
export const TEST_LABELS: Record<TestType, string> = {
  left: "左尾检验",
  right: "右尾检验",
  two: "双尾检验",
};

export const TEST_NOTES: Record<TestType, string> = {
  left: "H₁: μ < μ₀，拒绝域在左侧",
  right: "H₁: μ > μ₀，拒绝域在右侧",
  two: "H₁: μ ≠ μ₀，拒绝域在两侧",
};