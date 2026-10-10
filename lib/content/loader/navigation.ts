import { contentTree } from "@/lib/content-data/manifest";
import { hasCapability } from "@/lib/content/categoryKeys";
import type { Category, ContentItem } from "@/lib/types/content";
import { subjectVisibleToAgent } from "@/lib/constants/academic-year";

import { isSafeContentRef } from "@/lib/content/contentPathGuard";

import { isSubjectInRuntime } from "@/lib/content/offlineSubjects";

import type { ContentSearchScope, ResolvedPath } from "./types";
// ─────────────────────────────────────────────────────────────
// 多科目 AI 工具函数（基于 contentTree，覆盖全部科目/分类）
// ─────────────────────────────────────────────────────────────

/** 板块是否参与 AI 检索 / 大纲：由 manifest 的 capabilities 声明。 */
export function isSearchable(cat: Category): boolean {
  return hasCapability(cat, "search");
}

/** 从 contentTree 中按 (subjectId, categoryId, itemId) 查找内容项及其标题。 */
export function findContentItem(
  subjectId: string,
  categoryId: string,
  itemId: string,
): { subjectName: string; categoryName: string; item: ContentItem; parentTitle?: string } | undefined {
  for (const subject of contentTree.subjects) {
    if (!isSubjectInRuntime(subject.id)) continue;
    if (subject.id !== subjectId) continue;
    for (const cat of subject.categories) {
      if (cat.id !== categoryId) continue;
      for (const item of cat.items) {
        if (item.id === itemId) {
          return { subjectName: subject.name, categoryName: cat.name, item };
        }
        if (item.children) {
          const child = item.children.find((c) => c.id === itemId);
          if (child) {
            return { subjectName: subject.name, categoryName: cat.name, item: child, parentTitle: item.title };
          }
        }
      }
    }
  }
  return undefined;
}

/** 生成全科目大纲文本，供 AI 的 getOutline 工具。默认可按学年过滤，cross-year 传 "all"。 */
export function getMultiSubjectOutline(scope: ContentSearchScope = "all"): string {
  const lines: string[] = [];

  for (const subject of contentTree.subjects) {
    if (!isSubjectInRuntime(subject.id)) continue;
    if (subject.id === "other") continue;
    if (!subjectVisibleToAgent(subject.id, scope)) continue;
    lines.push(`\n=== ${subject.name} (${subject.id}) ===`);

    for (const cat of subject.categories) {
      if (!isSearchable(cat)) continue;
      if (!cat.items.length) continue;

      for (const item of cat.items) {
        if (item.children?.length) {
          // 课堂课节分组：直接列课节名，不套用「第X章」。
          const groupLabel = item.navigationOnly ? item.title : `第${item.id.replace(/^ch0?/, "")}章 ${item.title}`;
          lines.push(`\n  ${groupLabel}`);
          if (item.summary && !item.navigationOnly) lines.push(`    概要：${item.summary}`);
          for (const sec of item.children) {
            const flag = sec.status === "done" ? "" : "（待完善）";
            const p = `${subject.id}/${cat.id}/${sec.id}`;
            lines.push(`    - ${sec.id} ${sec.title}${flag} (${p})`);
          }
        } else {
          const label = cat.name || cat.id;
          const flag = item.status === "done" ? "" : "（待完善）";
          const p = `${subject.id}/${cat.id}/${item.id}`;
          lines.push(`  [${label}] ${item.id} ${item.title}${flag} (${p})`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function resolveContentPath(
  pathOrId: string,
  fallbackSubjectId: string,
): ResolvedPath {
  const parts = pathOrId.split("/");
  if (parts.length >= 3) {
    const [subjectId, categoryId, ...rest] = parts;
    const itemId = rest.join("/");
    if (!isSafeContentRef(subjectId, categoryId, itemId)) {
      const title = `${subjectId} > ${categoryId} > ${itemId}`;
      return { subjectId, categoryId, itemId, title, found: false };
    }
    const found = findContentItem(subjectId, categoryId, itemId);
    const title = found
      ? `${found.subjectName} > ${found.categoryName} > ${found.parentTitle ? found.parentTitle + " > " : ""}${found.item.title}`
      : `${subjectId} > ${categoryId} > ${itemId}`;
    return { subjectId, categoryId, itemId, title, found: !!found };
  }

  // 向下兼容：纯小节 ID（如 "1.4"），默认当前科目 detail
  if (!isSafeContentRef(fallbackSubjectId, "detail", pathOrId)) {
    return {
      subjectId: fallbackSubjectId,
      categoryId: "detail",
      itemId: pathOrId,
      title: `${fallbackSubjectId} > detail > ${pathOrId}`,
      found: false,
    };
  }
  const found = findContentItem(fallbackSubjectId, "detail", pathOrId);
  const title = found
    ? `${found.subjectName} > ${found.categoryName} > ${found.parentTitle ? found.parentTitle + " > " : ""}${found.item.title}`
    : `${fallbackSubjectId} > detail > ${pathOrId}`;
  return { subjectId: fallbackSubjectId, categoryId: "detail", itemId: pathOrId, title, found: !!found };
}
