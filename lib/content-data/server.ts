import "server-only";
import { contentTree } from "./manifest";
import type { Category, ContentItem, Subject, SubjectId } from "@/lib/types/content";

export { contentTree };
export function getSubject(id: SubjectId): Subject | undefined {
  return contentTree.subjects.find((subject) => subject.id === id);
}
export function getCategory(subjectId: SubjectId, categoryId: string): Category | undefined {
  return getSubject(subjectId)?.categories.find((category) => category.id === categoryId);
}
export function getContentItem(subjectId: SubjectId, categoryId: string, itemId: string): ContentItem | undefined {
  const find = (items: ContentItem[]): ContentItem | undefined => {
    for (const item of items) {
      if (item.id === itemId) return item;
      const nested = item.children ? find(item.children) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  return find(getCategory(subjectId, categoryId)?.items ?? []);
}
