import { navTree } from "@/lib/content-data/nav";
import { toAttachedFileRef } from "@/lib/chat/attachments/fileMentions";
import type { ContentItem } from "@/lib/types/content";
import type { ProjectStudioRef } from "./types";

/**
 * 「引用 Studio 教材」= 软链接：只记 path，正文由既有 getSection(path) 读，不复制到本机、不上云。
 * 检索直接走导航树（跨科目），不依赖当前打开的是哪一页。
 */

function walkItems(
  items: ContentItem[],
  visit: (item: ContentItem, ancestors: ContentItem[]) => void,
  ancestors: ContentItem[] = [],
  limit = Number.POSITIVE_INFINITY,
  counter = { value: 0 },
): void {
  for (const item of items) {
    if (counter.value >= limit) return;
    visit(item, ancestors);
    counter.value += 1;
    if (item.children?.length) walkItems(item.children, visit, [...ancestors, item], limit, counter);
  }
}

export function searchStudioRefs(query: string, limit = 20): ProjectStudioRef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const out: ProjectStudioRef[] = [];
  outer: for (const subject of navTree.subjects) {
    for (const category of subject.categories) {
      let hit = false;
      walkItems(category.items, (item, ancestors) => {
        if (out.length >= limit) {
          hit = true;
          return;
        }
        if (item.navigationOnly) return;
        const title = (item.title ?? "").toLowerCase();
        if (!title.includes(needle)) return;
        const ref = toAttachedFileRef(subject.id, category.id, subject.name, category.name, ancestors, item);
        out.push({
          path: ref.path,
          title: ref.title,
          address: ref.address,
          subjectId: ref.subjectId,
          categoryId: ref.categoryId,
          itemId: ref.itemId,
        });
        hit = true;
      });
      if (out.length >= limit && hit) break outer;
    }
  }
  return out;
}