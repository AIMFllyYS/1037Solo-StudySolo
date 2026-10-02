// 服务端内容加载器：读取磁盘上的 .md 笔记，供 API 路由与 AI 工具使用。
// 仅可在服务端（route handler / server component）导入。
import fs from "node:fs";
import path from "node:path";
import { contentTree } from "@/lib/content-data/manifest";
import { hasCapability } from "@/lib/content/categoryKeys";
import type { Category, ContentItem } from "@/lib/types/content";
import {
  subjectVisibleToAgent,
  type AcademicYearId,
} from "@/lib/constants/academic-year";
import { getSubjectMeta } from "@/lib/content-data/subjects.registry";
import { CONTENT_PATH_RESOLVERS, LEGACY_CHAPTERS_ROOT } from "@/lib/content/contentPaths";
import {
  contentIo,
  isResolvedPathInside,
  isSafeContentRef,
  isSafeContentSegment,
} from "@/lib/content/contentPathGuard";
import { normalizeSearchQuery } from "@/lib/ai/search/queryNormalize";
import { isSubjectInRuntime } from "@/lib/content/offlineSubjects";
import { readLectureArticle } from "@/lib/content/lectures/paths";
import { extractHtmlText } from "@/lib/content/lectures/extractHtml";
import type { LectureMaterialRole } from "@/lib/content/lectures/roles";

const CONTENT_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content");

/**
 * 课堂材料优先读取：命中 lectures 生成目录则返回受控文件，否则返回 null（走旧路径回退）。
 * 课堂文件路径不接受外部传入，完全由 articleId 经生成目录反查，杜绝任意路径读取。
 */
function tryReadLecture(
  subjectId: string,
  itemId: string,
): { format: "text" | "markdown" | "html"; raw: string; role: LectureMaterialRole } | null {
  const art = readLectureArticle(subjectId, itemId);
  if (!art) return null;
  return { format: art.format, raw: art.raw, role: art.role };
}

function authorizeContentRead(subjectId: string, categoryId: string, itemId: string): boolean {
  if (!isSafeContentRef(subjectId, categoryId, itemId)) return false;
  return !!findContentItem(subjectId, categoryId, itemId);
}

function readAuthorizedFile(filePath: string, rootDir: string): string | null {
  if (!isResolvedPathInside(filePath, rootDir)) return null;
  try {
    return contentIo.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** 读取某小节的 markdown 正文；不存在则返回 null。 */
export function readSectionMarkdown(
  chapterId: string,
  sectionId: string,
): string | null {
  if (!isSafeContentSegment(chapterId) || !isSafeContentSegment(sectionId)) return null;
  const inTree =
    findContentItem("probability", "detail", sectionId) ??
    findContentItem("probability", "detail", chapterId);
  if (!inTree) return null;
  const file = path.join(/* turbopackIgnore: true */ LEGACY_CHAPTERS_ROOT, chapterId, `${sectionId}.md`);
  return readAuthorizedFile(file, LEGACY_CHAPTERS_ROOT);
}

function resolveFilePath(
  subjectId: string,
  categoryId: string,
  itemId: string,
  ext: string,
): string {
  const resolver = CONTENT_PATH_RESOLVERS[getSubjectMeta(subjectId)?.contentRoot?.detail ?? "subject-tree"];
  return resolver(subjectId, categoryId, itemId, ext);
}

/**
 * 按 (subjectId, categoryId, itemId) 读取内容 markdown；不存在返回 null。
 * 供 page.tsx 做 SSR 首屏渲染与 /api/section 客户端回退共用，统一路径解析逻辑。
 *
 * 路径由 registry 的 contentRoot.detail 选择 resolver（见 lib/content/contentPaths.ts）：
 * - legacy-chapters + detail：itemId "1.1" → ch01/1.1.md，章级 id "ch01" → ch01/index.md
 * - 其余：content/{subjectId}/{categoryId}/{itemId}.md
 */
export function readContentMarkdown(
  subjectId: string,
  categoryId: string,
  itemId: string,
): string | null {
  if (!authorizeContentRead(subjectId, categoryId, itemId)) return null;
  const lecture = tryReadLecture(subjectId, itemId);
  if (lecture) {
    // 课堂材料：markdown 角色（纪要/手卡）与纯文本逐字稿可直接返回；HTML 笔记不在此通道。
    if (lecture.format === "html") return null;
    return lecture.raw;
  }
  const filePath = resolveFilePath(subjectId, categoryId, itemId, "md");
  return readAuthorizedFile(filePath, CONTENT_ROOT);
}

/**
 * 按 (subjectId, categoryId, itemId) 读取 HTML 内容；不存在返回 null。
 * 路径与 markdown 共用同一套 resolver，仅扩展名为 html。
 */
export function readContentHtml(
  subjectId: string,
  categoryId: string,
  itemId: string,
): string | null {
  if (!authorizeContentRead(subjectId, categoryId, itemId)) return null;
  const lecture = tryReadLecture(subjectId, itemId);
  if (lecture) return lecture.format === "html" ? lecture.raw : null;
  const filePath = resolveFilePath(subjectId, categoryId, itemId, "html");
  return readAuthorizedFile(filePath, CONTENT_ROOT);
}

export interface UnifiedContent {
  /** 材料的受控格式（课堂材料以生成目录为准，旧内容以传入 renderType 为准）。 */
  format: "text" | "markdown" | "html";
  raw: string;
  /** 仅课堂材料存在。 */
  materialRole?: LectureMaterialRole;
}

/**
 * 统一读取：课堂材料按其登记格式返回；旧内容按 renderType 回退到 md/html 读取。
 * component / 不存在返回 null。
 */
export function readContentUnified(
  subjectId: string,
  categoryId: string,
  itemId: string,
  renderType?: string,
): UnifiedContent | null {
  if (!authorizeContentRead(subjectId, categoryId, itemId)) return null;
  const lecture = tryReadLecture(subjectId, itemId);
  if (lecture) return { format: lecture.format, raw: lecture.raw, materialRole: lecture.role };
  if (renderType === "component") return null;
  if (renderType === "html") {
    const raw = readContentHtml(subjectId, categoryId, itemId);
    return raw === null ? null : { format: "html", raw };
  }
  if (renderType === "text") {
    // 旧链路没有 text 资源，回退到 md（纯文本同样可渲染）。
    const raw = readContentMarkdown(subjectId, categoryId, itemId);
    return raw === null ? null : { format: "text", raw };
  }
  const raw = readContentMarkdown(subjectId, categoryId, itemId);
  return raw === null ? null : { format: "markdown", raw };
}

/**
 * 检索 / 引用用「最佳纯文本」：课堂逐字稿原样、纪要/手卡为 Markdown 原文（由分块器剥标记）、
 * 课堂 HTML 笔记先做受控文本提取；旧内容维持原 md/html 读取不变。
 */
export function readContentSearchText(
  subjectId: string,
  categoryId: string,
  itemId: string,
): { format: "text" | "markdown" | "html"; text: string; materialRole?: LectureMaterialRole } | null {
  const lecture = tryReadLecture(subjectId, itemId);
  if (lecture) {
    if (lecture.format === "html") {
      try {
        return { format: "html", text: extractHtmlText(lecture.raw).text, materialRole: lecture.role };
      } catch {
        return { format: "html", text: lecture.raw, materialRole: lecture.role };
      }
    }
    return { format: lecture.format, text: lecture.raw, materialRole: lecture.role };
  }
  const legacyItem = findContentItem(subjectId, categoryId, itemId)?.item;
  if (legacyItem?.renderType === "html") {
    const raw = readContentHtml(subjectId, categoryId, itemId);
    return raw === null ? null : { format: "html", text: raw };
  }
  const raw = readContentMarkdown(subjectId, categoryId, itemId);
  return raw === null ? null : { format: "markdown", text: raw };
}

/**
 * 统一内容加载器：根据 renderType 分发到 readContentMarkdown 或 readContentHtml。
 * component 类型不走文件系统，返回 null（由客户端 ComponentRenderer 处理）。
 */
export function readContent(
  subjectId: string,
  categoryId: string,
  itemId: string,
  renderType?: string,
): string | null {
  return readContentUnified(subjectId, categoryId, itemId, renderType)?.raw ?? null;
}

// ─────────────────────────────────────────────────────────────
// 例题读取（与正文一致走服务端 SSR；/api/examples 仅作客户端回退/兼容）
// ─────────────────────────────────────────────────────────────

const EXAMPLES_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "examples");

export interface ExampleListItem {
  id: string;
  title: string;
}

export interface ExampleDetail extends ExampleListItem {
  content: string;
}

/** @deprecated 使用 ExampleListItem / ExampleDetail */
export type ExampleMeta = ExampleDetail;

function exampleTitleFromContent(content: string, file: string): string {
  const exampleLabelMatch = content.match(/:::example\{label=([^}]+)\}/);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const raw = exampleLabelMatch
    ? exampleLabelMatch[1].trim()
    : titleMatch
      ? titleMatch[1].trim()
      : file.replace(/\.md$/, "");
  return raw.replace(/^["']|["']$/g, "");
}

/** 允许 Unicode 文件名（如 EX01_硫酸黏度测定），仅拦截路径穿越。 */
function isSafeExampleId(exampleId: string): boolean {
  if (!exampleId) return false;
  if (exampleId.includes("..")) return false;
  if (/[\\/]/.test(exampleId)) return false;
  return exampleId === path.basename(exampleId);
}

function examplesDir(subjectId: string, chapterId: string, sectionId: string): string | null {
  if (!chapterId || !sectionId) return null;
  // 与正文同一套段白名单：任一参数含 ".."、"/"、"\" 等都会被拒，
  // 否则 /api/examples 的查询参数可让路径逃逸出 EXAMPLES_ROOT。
  if (subjectId && !isSafeContentSegment(subjectId)) return null;
  if (!isSafeContentSegment(chapterId) || !isSafeContentSegment(sectionId)) return null;
  return subjectId && subjectId !== "probability"
    ? path.join(/* turbopackIgnore: true */ EXAMPLES_ROOT, subjectId, chapterId, sectionId)
    : path.join(/* turbopackIgnore: true */ EXAMPLES_ROOT, chapterId, sectionId);
}

/** 仅返回例题 id/title（SSR 列表用，不含正文）。 */
export function readExamplesMeta(
  subjectId: string,
  chapterId: string,
  sectionId: string,
): ExampleListItem[] {
  const dir = examplesDir(subjectId, chapterId, sectionId);
  if (!dir) return [];
  let files: string[];
  try {
    files = fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  return files.map((file) => {
    const content = fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dir, file), "utf8");
    return {
      id: file.replace(/\.md$/, ""),
      title: exampleTitleFromContent(content, file),
    };
  });
}

/** 按 id 读取单题正文（按需加载）。 */
export function readExampleById(
  subjectId: string,
  chapterId: string,
  sectionId: string,
  exampleId: string,
): ExampleDetail | null {
  const dir = examplesDir(subjectId, chapterId, sectionId);
  if (!dir || !isSafeExampleId(exampleId)) return null;
  const filePath = path.join(/* turbopackIgnore: true */ dir, `${exampleId}.md`);
  try {
    const content = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
    return {
      id: exampleId,
      title: exampleTitleFromContent(content, `${exampleId}.md`),
      content,
    };
  } catch {
    return null;
  }
}

/**
 * 读取某小节下的所有例题（含正文；导出/兼容用）。
 */
export function readExamples(
  subjectId: string,
  chapterId: string,
  sectionId: string,
): ExampleMeta[] {
  return readExamplesMeta(subjectId, chapterId, sectionId).map((meta) => {
    const detail = readExampleById(subjectId, chapterId, sectionId, meta.id);
    return detail ?? { ...meta, content: "" };
  });
}

// ─────────────────────────────────────────────────────────────
// 题目测试读取（content/quiz/{subjectId}/{chapterId}.json）
// 由 /api/quiz 客户端读取；非 .md 文件，不走 readContentMarkdown。
// ─────────────────────────────────────────────────────────────

const QUIZ_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "quiz");

/**
 * 读取某章节的题目测试 JSON（学科命名空间，防多科 chapterId 冲突）：
 * content/quiz/{subjectId}/{chapterId}.json。
 * 文件不存在 / 解析失败 / 参数为空时返回 null。
 */
export function readQuiz(subjectId: string, chapterId: string): unknown | null {
  if (!subjectId || !chapterId) return null;
  // 仅允许安全的标识符，避免路径穿越。
  if (!/^[a-zA-Z0-9_-]+$/.test(subjectId) || !/^[a-zA-Z0-9_-]+$/.test(chapterId)) {
    return null;
  }
  const file = path.join(/* turbopackIgnore: true */ QUIZ_ROOT, subjectId, `${chapterId}.json`);
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 多科目 AI 工具函数（基于 contentTree，覆盖全部科目/分类）
// ─────────────────────────────────────────────────────────────

/** 板块是否参与 AI 检索 / 大纲：由 manifest 的 capabilities 声明。 */
function isSearchable(cat: Category): boolean {
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

export type ContentSearchScope = AcademicYearId | "all";

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

/** 解析复合路径或小节 ID 为统一的内容定位。 */
export interface ResolvedPath {
  subjectId: string;
  categoryId: string;
  itemId: string;
  title: string;
  found: boolean;
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

/** 多科全分类搜索结果。 */
export interface MultiSearchHit {
  subjectId: string;
  subjectName: string;
  categoryId: string;
  itemId: string;
  title: string;
  snippet: string;
  /** 可直接传给 getSection 的复合路径 */
  path: string;
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

export interface SearchAllContentOptions {
  limit?: number;
  /** 默认 all：跨学年。智能体默认传入当前学年；crossYear 时传 all。 */
  academicYear?: ContentSearchScope;
  /** 硬过滤到某一科目（如 histology）。 */
  subjectId?: string;
  /** 当前正在阅读的科目：先在该科目内搜，不足 3 条再放开学年。 */
  preferSubjectId?: string;
  /** 当前页面标题，供短查询向量扩展。 */
  queryContext?: string;
  /**
   * 索引未命中时是否回退全库子串扫描。默认跟 substringSearchAllowed()。
   * 测试可显式设为 false，证明 hybrid/BM25 索引本身能检索大二教材。
   */
  allowSubstring?: boolean;
  signal?: AbortSignal;
  onDiagnostics?: (diagnostics: import("@/lib/ai/search/hybridSearch").SearchDiagnostics) => void;
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
