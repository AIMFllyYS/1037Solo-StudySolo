import type { ContentItem } from "@/lib/types/content";
import { introAndElectrochemistryItems } from "./textbook/intro-and-electrochemistry";
import { spectroscopyItems } from "./textbook/spectroscopy";
import { massAndSeparationsItems } from "./textbook/mass-and-separations";

export const instrumentalAnalysisTextbookItems: ContentItem[] = [
  ...introAndElectrochemistryItems,
  ...spectroscopyItems,
  ...massAndSeparationsItems,
];
