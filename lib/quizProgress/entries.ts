import type { ProgressMap, ProgressEntry } from "./contracts";
export function toProgressEntries(map: ProgressMap): ProgressEntry[] {
  return Object.entries(map).map(([k, progress]) => {
    const parts = k.split("/");
    const scoped = parts.length >= 3;
    return {
      subjectId: parts[0] ?? k,
      ...(scoped ? { categoryId: parts[1] } : {}),
      chapterId: scoped ? parts.slice(2).join("/") : parts.slice(1).join("/"),
      progress,
    };
  });
}