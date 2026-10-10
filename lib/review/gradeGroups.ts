import { navTree } from "@/lib/content-data/nav";

import { compareChapter, objectiveBestOf, type ProgressEntry } from "@/lib/quiz-progress";

export const SUBJECT_NAME: Record<string, string> = Object.fromEntries(
  navTree.subjects.map((s) => [s.id, s.name]),
);
export const SUBJECT_ORDER: string[] = navTree.subjects.map((s) => s.id);

export interface SubjectGroup {
  id: string;
  name: string;
  items: ProgressEntry[];
  avgBest: number;
}

/** 把扁平成绩按科目分组、排序，并算各科平均最佳分。 */
export function groupBySubject(entries: ProgressEntry[]): SubjectGroup[] {
  const byId = new Map<string, ProgressEntry[]>();
  for (const e of entries) {
    const arr = byId.get(e.subjectId) ?? [];
    arr.push(e);
    byId.set(e.subjectId, arr);
  }
  const ids = [...byId.keys()].sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a);
    const ib = SUBJECT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return ids.map((id) => {
    const items = (byId.get(id) ?? []).slice().sort((a, b) => compareChapter(a.chapterId, b.chapterId));
    const objectiveBests = items.map((entry) => objectiveBestOf(entry.progress)).filter((value): value is number => value !== null);
    const avgBest = objectiveBests.length
      ? Math.round((objectiveBests.reduce((acc, value) => acc + value, 0) / objectiveBests.length) * 10) / 10
      : 0;
    return {
      id,
      name: SUBJECT_NAME[id] ?? id,
      items,
      avgBest,
    };
  });
}

/** 根据 subjectId + chapterId 在内容树中查找可导航的路由（categoryId + itemId）。 */
export function findChapterRoute(subjectId: string, chapterId: string): { categoryId: string; itemId: string } | null {
  const subject = navTree.subjects.find((s) => s.id === subjectId);
  if (!subject) return null;
  for (const category of subject.categories) {
    for (const item of category.items) {
      if (item.id === chapterId) {
        if (item.children?.length) {
          return { categoryId: category.id, itemId: item.children[0].id };
        }
        return { categoryId: category.id, itemId: chapterId };
      }
    }
  }
  return null;
}