import path from "node:path";

import { getSubjectMeta } from "@/lib/content-data/subjects.registry";
import { CONTENT_PATH_RESOLVERS, LEGACY_CHAPTERS_ROOT } from "@/lib/content/contentPaths";
import { isSafeContentSegment } from "@/lib/content/contentPathGuard";

import { readLectureArticle } from "@/lib/content/lectures/paths";
import { extractHtmlText } from "@/lib/content/lectures/extractHtml";
import type { LectureMaterialRole } from "@/lib/content/lectures/roles";
import type { UnifiedContent } from "./types";
import { CONTENT_ROOT, authorizeContentRead, readAuthorizedFile } from "./io";
import { findContentItem } from "./navigation";
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
