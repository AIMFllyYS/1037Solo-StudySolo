import path from "node:path";
import type { ContentRootDetail } from "@/lib/content-data/subjects.registry";

/** 内容根目录 content/（所有学科、lectures、quiz、examples 的共同根）。 */
export const CONTENT_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content");

/** 概率论 detail 历史目录：content/chapters/chNN/x.y.md */
export const LEGACY_CHAPTERS_ROOT = path.join(CONTENT_ROOT, "chapters");

export type ContentPathResolver = (
  subjectId: string,
  categoryId: string,
  itemId: string,
  ext: string,
) => string;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function subjectTreePath(
  subjectId: string,
  categoryId: string,
  itemId: string,
  ext: string,
): string {
  return path.join(/* turbopackIgnore: true */ CONTENT_ROOT, subjectId, categoryId, `${itemId}.${ext}`);
}

function legacyChaptersPath(
  subjectId: string,
  categoryId: string,
  itemId: string,
  ext: string,
): string {
  if (categoryId === "detail") {
    const chapterMatch = itemId.match(/^(\d+)\./);
    if (chapterMatch) {
      const chapterNum = parseInt(chapterMatch[1], 10);
      const chapterId = `ch${pad2(chapterNum)}`;
      return path.join(/* turbopackIgnore: true */ LEGACY_CHAPTERS_ROOT, chapterId, `${itemId}.${ext}`);
    }
    return path.join(/* turbopackIgnore: true */ LEGACY_CHAPTERS_ROOT, itemId, `index.${ext}`);
  }
  return subjectTreePath(subjectId, categoryId, itemId, ext);
}

export const CONTENT_PATH_RESOLVERS: Record<ContentRootDetail, ContentPathResolver> = {
  "subject-tree": subjectTreePath,
  "legacy-chapters": legacyChaptersPath,
};
