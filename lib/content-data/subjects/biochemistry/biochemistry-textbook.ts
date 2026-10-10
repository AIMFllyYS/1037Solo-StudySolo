import type { ContentItem } from "@/lib/types/content";
import { biomoleculesItems } from "./textbook/biomolecules";
import { metabolismItems } from "./textbook/metabolism";
import { geneExpressionItems } from "./textbook/gene-expression";
import { diseaseAndOrgansItems } from "./textbook/disease-and-organs";

export const biochemistryTextbookItems: ContentItem[] = [
  ...biomoleculesItems,
  ...metabolismItems,
  ...geneExpressionItems,
  ...diseaseAndOrgansItems,
];
