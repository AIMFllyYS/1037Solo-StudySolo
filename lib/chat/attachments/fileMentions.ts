import { navTree } from "@/lib/content-data/nav";
import type { ContentItem, ContentTree } from "@/lib/types/content";
import {
  filePathOf,
  type AttachedFileRef,
} from "@/lib/chat/composer/composerIntent";

export interface FileMentionContext {
  subjectId: string;
  categoryId: string;
  itemId: string;
}

export interface FileMentionGroup {
  id: "nearby" | "parent";
  label: string;
  items: AttachedFileRef[];
}

interface LocatedNavItem {
  subjectName: string;
  categoryName: string;
  ancestors: ContentItem[];
  item: ContentItem;
  siblings: ContentItem[];
  parent: ContentItem | null;
}

function isFolder(item: ContentItem): boolean {
  return !!(item.children && item.children.length > 0);
}

function walkItems(
  items: ContentItem[],
  visit: (item: ContentItem, ancestors: ContentItem[]) => void,
  ancestors: ContentItem[] = [],
): void {
  for (const item of items) {
    visit(item, ancestors);
    if (item.children?.length) walkItems(item.children, visit, [...ancestors, item]);
  }
}

export function locateNavItem(
  ctx: FileMentionContext,
  tree: ContentTree = navTree,
): LocatedNavItem | null {
  const subject = tree.subjects.find((item) => item.id === ctx.subjectId);
  const category = subject?.categories.find((item) => item.id === ctx.categoryId);
  if (!subject || !category) return null;
  let found: LocatedNavItem | null = null;
  walkItems(category.items, (item, ancestors) => {
    if (found || item.id !== ctx.itemId) return;
    const parent = ancestors[ancestors.length - 1] ?? null;
    found = {
      subjectName: subject.name,
      categoryName: category.name,
      ancestors,
      item,
      siblings: parent?.children ?? category.items,
      parent,
    };
  });
  return found;
}

export function buildFileAddress(
  subjectName: string,
  categoryName: string,
  ancestors: ContentItem[],
  item: ContentItem,
): string {
  return [subjectName, categoryName, ...ancestors.map((node) => node.title), item.title]
    .filter(Boolean)
    .join(" › ");
}

export function collectChildPaths(
  subjectId: string,
  categoryId: string,
  item: ContentItem,
  limit = 32,
): string[] {
  if (!item.children?.length) return [];
  const paths: string[] = [];
  walkItems(item.children, (child) => {
    if (paths.length >= limit) return;
    paths.push(filePathOf(subjectId, categoryId, child.id));
  });
  return paths;
}

export function toAttachedFileRef(
  subjectId: string,
  categoryId: string,
  subjectName: string,
  categoryName: string,
  ancestors: ContentItem[],
  item: ContentItem,
): AttachedFileRef {
  const folder = isFolder(item);
  return {
    path: filePathOf(subjectId, categoryId, item.id),
    title: item.title,
    kind: folder ? "folder" : "file",
    address: buildFileAddress(subjectName, categoryName, ancestors, item),
    subjectId,
    categoryId,
    itemId: item.id,
    childPaths: folder ? collectChildPaths(subjectId, categoryId, item) : undefined,
  };
}

function buildRefFromLocation(
  ctx: FileMentionContext,
  location: LocatedNavItem,
  item: ContentItem,
  ancestors: ContentItem[],
): AttachedFileRef {
  return toAttachedFileRef(ctx.subjectId, ctx.categoryId, location.subjectName, location.categoryName, ancestors, item);
}

function uniqueRefs(items: AttachedFileRef[]): AttachedFileRef[] {
  const seen = new Set<string>();
  const next: AttachedFileRef[] = [];
  for (const item of items) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    next.push(item);
  }
  return next;
}

function matchesQuery(item: AttachedFileRef, query: string): boolean {
  if (!query) return true;
  const hay = `${item.title} ${item.address} ${item.path} ${item.itemId}`.toLowerCase();
  return hay.includes(query.toLowerCase());
}

/** 当前打开页附近（同级）+ 父层级下的文件，供 # 菜单定向选择。 */
export function listFileMentions(
  ctx: FileMentionContext,
  query = "",
  tree: ContentTree = navTree,
): FileMentionGroup[] {
  const location = locateNavItem(ctx, tree);
  if (!location) return [];

  const nearby = uniqueRefs(
    location.siblings.map((item) => {
      const ancestors = item.id === location.item.id
        ? location.ancestors
        : location.parent
          ? location.ancestors
          : [];
      return buildRefFromLocation(ctx, location, item, ancestors);
    }),
  );

  const parentItems: AttachedFileRef[] = [];
  if (location.parent) {
    parentItems.push(buildRefFromLocation(ctx, location, location.parent, location.ancestors.slice(0, -1)));
    for (const child of location.parent.children ?? []) {
      parentItems.push(buildRefFromLocation(ctx, location, child, location.ancestors));
    }
  } else {
    parentItems.push(...nearby);
  }
  for (let i = location.ancestors.length - 2; i >= 0; i -= 1) {
    const ancestor = location.ancestors[i]!;
    parentItems.push(buildRefFromLocation(ctx, location, ancestor, location.ancestors.slice(0, i)));
  }

  const trimmed = query.trim();
  if (trimmed) {
    const searched: AttachedFileRef[] = [];
    const subject = tree.subjects.find((item) => item.id === ctx.subjectId);
    const category = subject?.categories.find((item) => item.id === ctx.categoryId);
    if (subject && category) {
      walkItems(category.items, (item, ancestors) => {
        searched.push(toAttachedFileRef(ctx.subjectId, ctx.categoryId, subject.name, category.name, ancestors, item));
      });
    }
    const hits = uniqueRefs(searched).filter((item) => matchesQuery(item, trimmed)).slice(0, 20);
    return hits.length ? [{ id: "nearby", label: "匹配的笔记", items: hits }] : [];
  }

  const nearbyItems = nearby.slice(0, 16);
  const parentOnly = uniqueRefs(parentItems)
    .filter((item) => !nearbyItems.some((near) => near.path === item.path))
    .slice(0, 16);
  const groups: FileMentionGroup[] = [];
  if (nearbyItems.length) groups.push({ id: "nearby", label: "当前页附近", items: nearbyItems });
  if (parentOnly.length) groups.push({ id: "parent", label: "父层级", items: parentOnly });
  return groups;
}

export function flattenFileMentions(groups: FileMentionGroup[]): AttachedFileRef[] {
  return groups.flatMap((group) => group.items);
}

/** 侧栏树节点 → 可拖进输入框的引用。 */
export function fileRefFromNav(
  subjectId: string,
  categoryId: string,
  item: ContentItem,
  tree: ContentTree = navTree,
): AttachedFileRef {
  const located = locateNavItem({ subjectId, categoryId, itemId: item.id }, tree);
  if (located) {
    return toAttachedFileRef(subjectId, categoryId, located.subjectName, located.categoryName, located.ancestors, located.item);
  }
  const subject = tree.subjects.find((entry) => entry.id === subjectId);
  const category = subject?.categories.find((entry) => entry.id === categoryId);
  return toAttachedFileRef(subjectId, categoryId, subject?.name ?? subjectId, category?.name ?? categoryId, [], item);
}

export interface ComposerTrigger {
  type: "slash" | "hash";
  query: string;
  start: number;
}

/** 光标前最后一个以 / 或 # 开头的 token。 */
export function detectComposerTrigger(text: string, cursor: number): ComposerTrigger | null {
  const before = text.slice(0, Math.max(0, cursor));
  const match = before.match(/(^|[\s])([/#])([^\s]*)$/);
  if (!match) return null;
  const tokenStart = (match.index ?? 0) + match[1]!.length;
  return {
    type: match[2] === "/" ? "slash" : "hash",
    query: match[3] ?? "",
    start: tokenStart,
  };
}

export function replaceComposerTrigger(text: string, trigger: ComposerTrigger, cursor: number): string {
  return `${text.slice(0, trigger.start)}${text.slice(cursor)}`;
}
