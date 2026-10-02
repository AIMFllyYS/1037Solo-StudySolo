// Shared/client metadata entry: never import the full build-time manifest here.
export { navTree as contentTree } from './nav';
/** @public 内容树类型的兼容入口。 */
export type {
  ContentTree,
  Subject,
  Category,
  ContentItem,
  SubjectId,
  CategoryId,
  RenderType,
} from '@/lib/types/content';

import { navTree as contentTree } from './nav';
import type {
  Subject,
  Category,
  ContentItem,
  SubjectId,
} from '@/lib/types/content';

export function getSubject(id: SubjectId): Subject | undefined {
  return contentTree.subjects.find((s) => s.id === id);
}

export function getCategory(
  subjectId: SubjectId,
  categoryId: string,
): Category | undefined {
  const subject = getSubject(subjectId);
  return subject?.categories.find((c) => c.id === categoryId);
}

export function getContentItem(
  subjectId: SubjectId,
  categoryId: string,
  itemId: string,
): ContentItem | undefined {
  const category = getCategory(subjectId, categoryId);
  function findItem(items: ContentItem[]): ContentItem | undefined {
    for (const item of items) {
      if (item.id === itemId) return item;
      if (item.children) {
        const found = findItem(item.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return category ? findItem(category.items) : undefined;
}

function firstUsableItem(items: ContentItem[]): ContentItem | null {
  for (const item of items) {
    if (item.children?.length) {
      const child = firstUsableItem(item.children);
      if (child) return child;
    }
    if (item.id === 'toc') continue;
    if (item.status !== 'stub') return item;
  }
  return items[0] ?? null;
}

/** 该科「开始学习」落点：优先教材/详解中非 stub 项，再退到任一有内容的板块。不硬编码 /detail/。 */
export function firstLearnHref(subject: Subject): string | null {
  const preferred = ['textbook', 'detail'];
  for (const id of preferred) {
    const cat = subject.categories.find((c) => c.id === id);
    if (!cat) continue;
    const item = firstUsableItem(cat.items);
    if (item) return `/${subject.id}/${cat.id}/${item.id}`;
  }
  const cat = subject.categories.find((c) => c.items.length > 0);
  if (!cat) return null;
  const item = firstUsableItem(cat.items);
  return item ? `/${subject.id}/${cat.id}/${item.id}` : null;
}

/** 查找 itemId 的父节点及其兄弟列表（同父节点的所有 children）。
 *  若 itemId 本身是顶层 item（无父节点），返回 parent=null + category.items。 */
export function getSiblings(
  subjectId: SubjectId,
  categoryId: string,
  itemId: string,
): { parent: ContentItem | null; siblings: ContentItem[] } {
  const category = getCategory(subjectId, categoryId);
  if (!category) return { parent: null, siblings: [] };

  function findParent(items: ContentItem[], target: string): ContentItem | null {
    for (const item of items) {
      if (item.children?.some((child) => child.id === target)) return item;
      if (item.children) {
        const found = findParent(item.children, target);
        if (found) return found;
      }
    }
    return null;
  }

  const parent = findParent(category.items, itemId);
  const siblings = parent?.children ?? category.items;
  return { parent, siblings };
}
