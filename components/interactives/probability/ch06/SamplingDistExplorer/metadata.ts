import type { TabId } from "@/lib/learning/probability/samplingDistributions";
import { ACCENT, ACCENT_LIGHT, TEAL, TEAL_LIGHT, ORANGE, ORANGE_LIGHT } from "./appearance";
export interface TabMeta {
  id: TabId;
  label: string;
  color: string;
  bg: string;
  tint: string;
}

export const TABS: TabMeta[] = [
  { id: "chi2", label: "χ²(n)", color: ACCENT, bg: ACCENT_LIGHT, tint: "#7c3aed" },
  { id: "t", label: "t(n)", color: TEAL, bg: TEAL_LIGHT, tint: TEAL },
  { id: "F", label: "F(m,n)", color: ORANGE, bg: ORANGE_LIGHT, tint: ORANGE },
];