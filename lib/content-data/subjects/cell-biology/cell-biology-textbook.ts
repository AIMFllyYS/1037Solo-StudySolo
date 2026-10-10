import type { ContentItem } from "@/lib/types/content";
import { foundationsItems } from "./textbook/foundations";
import { cellStructuresItems } from "./textbook/cell-structures";
import { cellEnvironmentItems } from "./textbook/cell-environment";
import { cellLifeItems } from "./textbook/cell-life";

export const cellBiologyTextbookItems: ContentItem[] = [
  ...foundationsItems,
  ...cellStructuresItems,
  ...cellEnvironmentItems,
  ...cellLifeItems,
];
