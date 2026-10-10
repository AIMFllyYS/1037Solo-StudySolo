import { contentTree } from "@/lib/content-data/manifest";

import type { ContentItem } from "@/lib/types/content";
import { subjectVisibleToAgent } from "@/lib/constants/academic-year";

import { normalizeSearchQuery } from "@/lib/ai/search/queryNormalize";
import { isSubjectInRuntime } from "@/lib/content/offlineSubjects";

import type { MultiSearchHit, SearchAllContentOptions, ContentSearchScope } from "./types";
import { isSearchable } from "./navigation";
import { readContentSearchText } from "./readers";
/** 纯文本化 markdown（去掉指令与符号），用于检索/喂给 AI。 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/:::[a-zA-Z]+(\{[^}]*\})?/g, " ")
    .replace(/:::/g, " ")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => " " + m.replace(/\$/g, "") + " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * 在全部科目的 detail/recording/summary 中做关键词检索（子串匹配 fallback）。
 * detail 命中优先排在前面。多关键词按空格拆分做 OR 匹配。
 */
function substringSearch(
  query: string,
  limit = 8,
  scope: ContentSearchScope = "all",
  subjectId?: string,
  signal?: AbortSignal,
): MultiSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const keywords = q.split(/\s+/).filter(Boolean);
  if (!keywords.length) return [];

  const detailHits: MultiSearchHit[] = [];
  const otherHits: MultiSearchHit[] = [];

  for (const subject of contentTree.subjects) {
    signal?.throwIfAborted();
    if (!isSubjectInRuntime(subject.id)) continue;
    if (subject.id === "other") continue;
    if (subjectId && subject.id !== subjectId) continue;
    if (!subjectVisibleToAgent(subject.id, scope)) continue;
    for (const cat of subject.categories) {
      if (!isSearchable(cat)) continue;
      const isDetail = cat.id === "detail";

      const leafItems: { item: ContentItem; parentTitle?: string }[] = [];
      for (const item of cat.items) {
        // 课堂课节分组父节点不可路由，只检索其材料叶子。
        if (item.navigationOnly) {
          for (const child of item.children ?? []) {
            leafItems.push({ item: child, parentTitle: item.title });
          }
        } else if (item.children?.length) {
          for (const child of item.children) {
            leafItems.push({ item: child, parentTitle: item.title });
          }
        } else {
          leafItems.push({ item });
        }
      }

      for (const { item, parentTitle } of leafItems) {
        signal?.throwIfAborted();
        if (item.status === "stub") continue;
        // 课堂 HTML 笔记走受控文本提取，其余维持 markdown 读取。
        const searched = readContentSearchText(subject.id, cat.id, item.id);
        const text = searched ? stripMarkdown(searched.text) : "";
        if (!text) continue;

        let matchIdx = -1;
        for (const kw of keywords) {
          const idx = text.indexOf(kw);
          if (idx >= 0) { matchIdx = idx; break; }
        }
        if (matchIdx < 0) continue;

        const start = Math.max(0, matchIdx - 80);
        const end = Math.min(text.length, matchIdx + 120);
        const titleParts = [subject.name, cat.name];
        if (parentTitle) titleParts.push(parentTitle);
        titleParts.push(`${item.id} ${item.title}`);

        const hit: MultiSearchHit = {
          subjectId: subject.id,
          subjectName: subject.name,
          categoryId: cat.id,
          itemId: item.id,
          title: titleParts.join(" > "),
          snippet: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""),
          path: `${subject.id}/${cat.id}/${item.id}`,
        };

        if (isDetail) {
          detailHits.push(hit);
        } else {
          otherHits.push(hit);
        }

        if (detailHits.length + otherHits.length >= limit * 2) break;
      }
      if (detailHits.length + otherHits.length >= limit * 2) break;
    }
  }

  return [...detailHits, ...otherHits].slice(0, limit);
}

/**
 * 在全部科目中做语义+关键词混合检索。
 * 索引存在时使用 hybridSearch（BM25 + 向量 + rerank），否则 fallback 到子串匹配。
 */
export async function searchAllContentResult(
  query: string,
  limitOrOpts: number | SearchAllContentOptions = 8,
): Promise<{ hits: MultiSearchHit[]; diagnostics: import("@/lib/ai/search/hybridSearch").SearchDiagnostics | null }> {
  const q = normalizeSearchQuery(query.trim()) || query.trim();
  if (!q) return { hits: [], diagnostics: null };
  const opts: SearchAllContentOptions =
    typeof limitOrOpts === "number" ? { limit: limitOrOpts } : limitOrOpts;
  const limit = opts.limit ?? 8;
  const scope: ContentSearchScope = opts.academicYear ?? "all";
  opts.signal?.throwIfAborted();
  let diagnostics: import("@/lib/ai/search/hybridSearch").SearchDiagnostics | null = null;

  try {
    const { hybridSearchWithDiagnostics } = await import('@/lib/ai/search/hybridSearch');
    const result = await hybridSearchWithDiagnostics(q, {
      topK: Math.max(limit * 3, 16),
      academicYear: scope,
      subjectId: opts.subjectId,
      preferSubjectId: opts.preferSubjectId,
      queryContext: opts.queryContext,
      signal: opts.signal,
    });
    diagnostics = result.diagnostics;
    opts.onDiagnostics?.(diagnostics);
    const filtered = result.hits.filter((hit) => {
      if (opts.subjectId && hit.subjectId !== opts.subjectId) return false;
      return subjectVisibleToAgent(hit.subjectId, scope);
    });
    if (filtered.length > 0) return { hits: filtered.slice(0, limit), diagnostics };
  } catch (err) {
    opts.signal?.throwIfAborted();
    const { searchLog } = await import('@/lib/ai/search/searchLog');
    searchLog.error('search.query', { message: String((err as Error).message), query: q.slice(0, 80) });
  }

  const allowSubstring = opts.allowSubstring ?? substringSearchAllowed();
  if (!allowSubstring) {
    const { searchLog } = await import('@/lib/ai/search/searchLog');
    searchLog.warn('search.fallback.disabled', { env: process.env.NODE_ENV, query: q.slice(0, 80) });
    return { hits: [], diagnostics };
  }
  opts.signal?.throwIfAborted();
  const { searchLog } = await import('@/lib/ai/search/searchLog');
  searchLog.info('search.fallback.substring', { env: process.env.NODE_ENV, query: q.slice(0, 80) });
  return { hits: substringSearch(q, limit, scope, opts.subjectId, opts.signal), diagnostics };
}

export async function searchAllContent(query: string, limitOrOpts: number | SearchAllContentOptions = 8): Promise<MultiSearchHit[]> {
  return (await searchAllContentResult(query, limitOrOpts)).hits;
}

function substringSearchAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  console.warn(
    '[search] 生产环境未找到检索索引，已禁用全库子串扫描。请运行 pnpm build-index 构建索引。',
  );
  return false;
}
