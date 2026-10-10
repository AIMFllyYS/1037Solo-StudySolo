import type { ContentItem } from "@/lib/types/content";
import { foundationsItems } from "./detail/foundations";
import { hydrocarbonsItems } from "./detail/hydrocarbons";
import { stereochemistryItems } from "./detail/stereochemistry";
import { functionalGroupsItems } from "./detail/functional-groups";
import { biomoleculesItems } from "./detail/biomolecules";

export const organicChemistryDetailItems: ContentItem[] = [
  ...foundationsItems,
  ...hydrocarbonsItems,
  ...stereochemistryItems,
  ...functionalGroupsItems,
  ...biomoleculesItems,
];
