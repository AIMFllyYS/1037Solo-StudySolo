import type { ContentItem } from "@/lib/types/content";
import { tissuesItems } from "./textbook/tissues";
import { sensesAndRegulationItems } from "./textbook/senses-and-regulation";
import { visceralOrgansItems } from "./textbook/visceral-organs";
import { embryologyItems } from "./textbook/embryology";

export const histologyTextbookItems: ContentItem[] = [
  ...tissuesItems,
  ...sensesAndRegulationItems,
  ...visceralOrgansItems,
  ...embryologyItems,
];
