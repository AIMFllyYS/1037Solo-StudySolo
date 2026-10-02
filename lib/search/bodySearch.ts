// 服务端：按科目分片扫 Markdown / 纯文本正文。不要在客户端 import（会拖进 fs）。
import { contentTree } from "@/lib/content-data/manifest";
import { readContentMarkdown } from "@/lib/content/loader";
import { isSubjectId } from "@/lib/types/content";
import { isSubjectInRuntime } from "@/lib/content/offlineSubjects";
import { INDEX_FILES, parseManifest, readLocalIndexFile } from "@/lib/ai/search/indexIo";
import {
  buildGlobalSearchIndex,
  clampSearchQuery,
  matchBodyText,
  stripForSearch,
  type GlobalSearchEntry,
  type GlobalSearchHit,
} from "@/lib/search/globalSearch";

const SUBJECT_BODY_LIMIT = 16;
const CACHE_BYTES = 32 * 1024 * 1024;
const CACHE_ENTRIES = 1024;
const BODY_TTL_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 15_000;

let entriesBySubject: Map<string, GlobalSearchEntry[]> | null = null;
let cacheRevision = "";
let cacheBytes = 0;
const strippedByEntryId = new Map<string, { body: string; bytes: number; expiresAt: number }>();

function synchronizeRevision(): void {
  const revision = parseManifest(readLocalIndexFile(INDEX_FILES.manifest))?.contentHash ?? "unindexed";
  if (revision === cacheRevision) return;
  cacheRevision = revision;
  cacheBytes = 0;
  strippedByEntryId.clear();
}

function trimCache(): void {
  while (cacheBytes > CACHE_BYTES || strippedByEntryId.size > CACHE_ENTRIES) {
    const oldest = strippedByEntryId.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= strippedByEntryId.get(oldest)!.bytes;
    strippedByEntryId.delete(oldest);
  }
}

function subjectEntries(subjectId: string): GlobalSearchEntry[] {
  if (!entriesBySubject) {
    entriesBySubject = new Map();
    for (const entry of buildGlobalSearchIndex(contentTree)) {
      const list = entriesBySubject.get(entry.subjectId) ?? [];
      list.push(entry);
      entriesBySubject.set(entry.subjectId, list);
    }
  }
  return entriesBySubject.get(subjectId) ?? [];
}

function preparedBodyFor(entry: GlobalSearchEntry): string | null {
  const cached = strippedByEntryId.get(entry.id);
  if (cached && cached.expiresAt > Date.now()) {
    strippedByEntryId.delete(entry.id);
    strippedByEntryId.set(entry.id, cached);
    return cached.body || null;
  }
  if (cached) { cacheBytes -= cached.bytes; strippedByEntryId.delete(entry.id); }
  const raw = readContentMarkdown(entry.subjectId, entry.categoryId, entry.itemId);
  const stripped = raw ? stripForSearch(raw) : "";
  const bytes = Buffer.byteLength(stripped, "utf8");
  if (bytes <= CACHE_BYTES) {
    strippedByEntryId.set(entry.id, { body: stripped, bytes, expiresAt: Date.now() + (stripped ? BODY_TTL_MS : NEGATIVE_TTL_MS) });
    cacheBytes += bytes;
    trimCache();
  }
  return stripped || null;
}

/** 测试用：确认暖查询不再扩缓存。 */
export function bodySearchCacheSize(): number {
  return strippedByEntryId.size;
}

export function bodySearchCacheBytes(): number {
  return cacheBytes;
}

export function bodySearchCacheRevision(): string {
  return cacheRevision;
}

export function __resetBodySearchCacheForTests(): void {
  entriesBySubject = null;
  cacheRevision = "";
  cacheBytes = 0;
  strippedByEntryId.clear();
}

export function searchSubjectBody(
  subjectId: string,
  rawQuery: string,
  limit = SUBJECT_BODY_LIMIT,
): GlobalSearchHit[] {
  const query = clampSearchQuery(rawQuery);
  if (!query || !isSubjectId(subjectId) || !isSubjectInRuntime(subjectId)) return [];
  synchronizeRevision();

  const hits: GlobalSearchHit[] = [];
  for (const entry of subjectEntries(subjectId)) {
    const body = preparedBodyFor(entry);
    if (!body) continue;
    const hit = matchBodyText(entry, body, query, body);
    if (hit) hits.push(hit);
  }

  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, limit);
}
