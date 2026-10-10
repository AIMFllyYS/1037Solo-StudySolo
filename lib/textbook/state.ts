import type { AcademicYearId } from "@/lib/constants/academic-year";
import type { ContentItem } from "@/lib/types/content";

export interface TextbookSelection {
  subjectId: string;
  subjectName: string;
  categoryId: string;
  categoryName: string;
  item: ContentItem;
}

/** 存在同一个managed window的数据中；正文仍按需读取，不在此缓存或跨账号落盘。 */
export interface TextbookReadingState {
  yearId: AcademicYearId;
  subjectId: string | null;
  selection: TextbookSelection | null;
  expandedKeys: string[];
}

export function textbookSelectionKey(selection: TextbookSelection): string {
  return `${selection.subjectId}/${selection.categoryId}/${selection.item.id}`;
}
