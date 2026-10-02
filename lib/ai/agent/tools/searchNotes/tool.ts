import { tool } from "ai";
import { z } from "zod";
import { findContentItem, searchAllContent, type ContentSearchScope } from "@/lib/content/loader";
import { getIndexHealth } from "@/lib/ai/search/indexHealth";
import type { SearchDiagnostics } from "@/lib/ai/search/hybridSearch";
import {
  SEARCH_NOTES_HIT_LIMIT,
  type SearchHit,
  type SearchNotesOutput,
  type SearchNotesScope,
} from "@/lib/ai/agent/tools/searchNotes/types";
import {
  filterNotesBySubject,
  findUserNote,
  listUserNoteLines,
  searchUserNoteCatalog,
} from "@/lib/ai/agent/tools/memoryCatalog";
import { subjectLabel } from "@/lib/notes/userNote";
import {
  allocateCiteIndex,
  CITE_HIT_HINT,
  prefixCiteTag,
} from "@/lib/ai/agent/tools/citeIndex";
import {
  dedupeByContextKey,
  normalizeContextKeyPart,
  toText,
  type StudyToolContext,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";

/** 测试可替换检索与健康检查，避免打真实索引。 */
export const searchNotesIo = { getIndexHealth, searchAllContent, findContentItem };

function personalHitsOf(
  notes: ReturnType<typeof searchUserNoteCatalog>,
): SearchHit[] {
  return notes.map((note) => ({
    title: note.title.trim() || "无标题笔记",
    path: `note:${note.id}`,
    snippet: note.snippet,
    kind: "personal" as const,
    noteId: note.id,
    subjectId: note.subjectId ?? undefined,
  }));
}

function getPersonalNote(
  ctx: StudyToolContext,
  runtime: StudyToolRuntime,
  id: string,
): SearchNotesOutput {
  if (!(ctx.userNotes?.length) && ctx.editingUserNote) {
    return {
      text: "窗内笔记对话请只整理当前这篇，用 updateUserNote 写回。查找个人笔记请到右侧主对话。",
      hits: [],
    };
  }
  const note = findUserNote(ctx.userNotes ?? [], id);
  if (!note) {
    const available = listUserNoteLines(ctx.userNotes ?? []).join("\n") || "（目录为空）";
    return {
      text: `未找到个人笔记 id=${id}。可先 searchNotes(scope="personal") 看列表：\n${available}`,
      hits: [],
    };
  }
  const title = note.title.trim() || "无标题笔记";
  const contextKey = `user-note:${note.id}`;
  const already = runtime.loadedContextKeys.has(contextKey);
  const citeIndex = already ? undefined : allocateCiteIndex(runtime);
  const body = `【个人笔记 ${title} / ${note.id} / ${subjectLabel(note.subjectId)}】\n\n${note.markdown}`;
  return dedupeByContextKey(runtime, "searchNotes", {
    text: citeIndex ? prefixCiteTag(body, citeIndex, "笔记") : body,
    contextKey,
    hits: [{
      title,
      path: `note:${note.id}`,
      snippet: note.markdown.slice(0, 80),
      kind: "personal",
      noteId: note.id,
      subjectId: note.subjectId ?? undefined,
      citeIndex,
    }],
  });
}

function listPersonalNotes(ctx: StudyToolContext, subjectId?: string): SearchNotesOutput {
  if (!(ctx.userNotes?.length) && ctx.editingUserNote) {
    return {
      text: "窗内笔记对话请只整理当前这篇，用 updateUserNote 写回。查找个人笔记请到右侧主对话。",
      hits: [],
    };
  }
  const notes = filterNotesBySubject(ctx.userNotes ?? [], subjectId);
  if (!notes.length) {
    return { text: subjectId ? `没有绑定 ${subjectId} 的个人笔记。` : "本机没有可查找的个人笔记。", hits: [] };
  }
  const hits = personalHitsOf(searchUserNoteCatalog(notes, ""));
  return {
    text: `个人笔记 ${notes.length} 篇（先看列表，需要哪篇再 searchNotes(id)）：\n${listUserNoteLines(notes).join("\n")}`,
    hits,
  };
}

function searchPersonalNotes(
  ctx: StudyToolContext,
  runtime: StudyToolRuntime,
  query: string,
  subjectId?: string,
): SearchNotesOutput {
  if (!(ctx.userNotes?.length) && ctx.editingUserNote) {
    return {
      text: "窗内笔记对话请只整理当前这篇，用 updateUserNote 写回。查找个人笔记请到右侧主对话。",
      hits: [],
    };
  }
  const notes = searchUserNoteCatalog(filterNotesBySubject(ctx.userNotes ?? [], subjectId), query);
  if (!notes.length) {
    return { text: "未检索到相关个人笔记。可换关键词，或 searchNotes(scope=\"personal\") 先列出。", hits: [] };
  }
  const contextKey = `personal-search:${normalizeContextKeyPart(query)}:${subjectId ?? ""}`;
  const already = runtime.loadedContextKeys.has(contextKey);
  const hits = notes.map((note) => {
    const title = note.title.trim() || "无标题笔记";
    return {
      title,
      path: `note:${note.id}`,
      snippet: note.snippet,
      kind: "personal" as const,
      noteId: note.id,
      subjectId: note.subjectId ?? undefined,
      citeIndex: already ? undefined : allocateCiteIndex(runtime),
    };
  });
  const lines = hits.map((hit) => {
    const label = hit.citeIndex ? `[${hit.citeIndex}] ${hit.title}` : hit.title;
    return `${label} (id: ${hit.noteId} / ${subjectLabel(hit.subjectId ?? null)})\n…${hit.snippet}…`;
  });
  lines.push("\n如需全文，再调用 searchNotes(id: \"对应 id\", scope: \"personal\")。不要一次取多篇。");
  lines.push(CITE_HIT_HINT);
  return dedupeByContextKey(runtime, "searchNotes", {
    text: lines.join("\n\n"),
    contextKey,
    hits,
  });
}

async function searchClassNotes(
  ctx: StudyToolContext,
  runtime: StudyToolRuntime,
  query: string,
  crossYear?: boolean,
  subjectId?: string,
  signal?: AbortSignal,
): Promise<SearchNotesOutput> {
  const health = searchNotesIo.getIndexHealth();
  if (!health.ok) {
    return { text: `检索索引未加载：${health.reason}`, hits: [], diagnostics: undefined };
  }
  const found = searchNotesIo.findContentItem(ctx.subjectId, ctx.categoryId, ctx.itemId);
  const queryContext = found
    ? `${found.subjectName} ${found.parentTitle ?? ""} ${found.item.title}`.replace(/\s+/g, " ").trim()
    : undefined;
  const yearScope: ContentSearchScope = crossYear ? "all" : ctx.academicYear;
  const requestDiagnostics: { value: SearchDiagnostics | null } = { value: null };
  const run = (year: ContentSearchScope) =>
    searchNotesIo.searchAllContent(query, {
      limit: SEARCH_NOTES_HIT_LIMIT,
      academicYear: year,
      subjectId: subjectId || undefined,
      preferSubjectId: subjectId ? undefined : ctx.subjectId,
      queryContext,
      signal,
      onDiagnostics: (value) => { requestDiagnostics.value = value; },
    });
  let hits = await run(yearScope);
  let widened = false;
  if (!hits.length && yearScope !== "all") {
    hits = await run("all");
    widened = hits.length > 0;
  }
  const diag = requestDiagnostics.value;
  const diagnostics = diag
    ? {
        bm25Hits: diag.bm25Hits,
        vecHits: diag.vecHits,
        mode: diag.mode,
        indexBuiltAt: diag.indexBuiltAt || health.manifest?.builtAt,
        ms: diag.ms,
        embedError: diag.embedError,
      }
    : undefined;
  if (!hits.length) {
    return { text: "未检索到相关课堂笔记。可尝试更换关键词，或调用 getOutline 浏览目录。", hits: [], diagnostics };
  }
  const contextKey = `search:${normalizeContextKeyPart(query)}`;
  const already = runtime.loadedContextKeys.has(contextKey);
  const numbered = hits.map((h) => ({
    title: h.title,
    path: h.path,
    snippet: h.snippet,
    kind: "class" as const,
    citeIndex: already ? undefined : allocateCiteIndex(runtime),
  }));
  const lines = numbered.map((h) => {
    const label = h.citeIndex ? `[${h.citeIndex}] ${h.title}` : h.title;
    return `${label} (path: ${h.path})\n…${h.snippet}…`;
  });
  if (widened) lines.unshift("（当前学年无命中，以下为跨学年结果）");
  lines.push('\n如需查看完整内容，可调用 getSection(path: "对应路径")。');
  lines.push(CITE_HIT_HINT);
  return dedupeByContextKey(runtime, "searchNotes", {
    text: lines.join("\n\n"),
    contextKey,
    hits: numbered,
    diagnostics,
  });
}

function mergeNoteResults(classOut: SearchNotesOutput | null, personalOut: SearchNotesOutput | null): SearchNotesOutput {
  const classHits = classOut?.hits ?? [];
  const personalHits = personalOut?.hits ?? [];
  if (!classHits.length && !personalHits.length) {
    return {
      text: "未检索到相关内容。可尝试更换关键词，或调用 getOutline 浏览目录。",
      hits: [],
      diagnostics: classOut?.diagnostics,
    };
  }
  const parts = [];
  if (classOut?.text && classHits.length) parts.push(`【课堂笔记】\n${classOut.text}`);
  if (personalOut?.text && personalHits.length) parts.push(`【个人笔记】\n${personalOut.text}`);
  return {
    text: parts.join("\n\n"),
    contextKey: classOut?.contextKey,
    deduped: classOut?.deduped,
    hits: [...classHits, ...personalHits],
    diagnostics: classOut?.diagnostics,
  };
}

export function createSearchNotesTool(ctx: StudyToolContext, runtime: StudyToolRuntime) {
  return tool({
    description:
      "查找课堂笔记或个人笔记。默认 scope=all：课堂走语义+关键词检索，个人笔记按标题/正文/科目匹配本机目录。先看列表（标题+片段+id/path），不要一次展开全文。课堂全文用 getSection(path)；个人全文再调 searchNotes(id)。查询用知识点短语（如「核糖体」），不要用「什么是…」整句。主对话在学生提到自己的笔记或需要对照旧稿时主动调用。窗内笔记对话请只整理当前篇，不要翻整库。命中条目带有 [n] 编号；凡依据某条命中写出的句子，句末必须标注对应编号。",
    inputSchema: z.object({
      query: z.string().optional().describe("检索短语，如 '贝叶斯公式'、'线粒体'、'被覆上皮'。空查询 + scope=personal 则列出个人笔记。"),
      id: z.string().optional().describe("个人笔记 id，只取这一篇全文。先列表再传 id。"),
      scope: z.enum(["class", "personal", "all"]).optional().describe("class=课堂笔记；personal=个人笔记；all=两者都搜。默认 all。"),
      crossYear: z.boolean().optional().describe("true 时跨学年检索课堂笔记。医学基础常与大一化学/物理交叉，此时应打开。"),
      subjectId: z.string().optional().describe("限定科目 id，如 histology、biochemistry、anatomy。课堂与个人笔记都生效。"),
    }),
    execute: async ({ query, id, scope, crossYear, subjectId }, { abortSignal }): Promise<SearchNotesOutput> => {
      const resolvedScope: SearchNotesScope = scope ?? "all";
      const noteId = id?.trim();
      if (noteId) {
        if (resolvedScope === "class") {
          return { text: "课堂笔记请用 getSection(path) 取全文，不要把个人笔记 id 当路径。", hits: [] };
        }
        return getPersonalNote(ctx, runtime, noteId);
      }

      const q = (query ?? "").trim();
      const wantClass = resolvedScope === "class" || resolvedScope === "all";
      const wantPersonal = resolvedScope === "personal" || resolvedScope === "all";

      if (!q && wantPersonal && !wantClass) return listPersonalNotes(ctx, subjectId);
      if (!q && wantPersonal) {
        const personal = listPersonalNotes(ctx, subjectId);
        return {
          text: `${personal.text}\n\n课堂笔记请提供检索短语（知识点本身，不要整句问句）。`,
          hits: personal.hits,
        };
      }
      if (!q) {
        return { text: "请提供检索短语（如「核糖体」），或 searchNotes(scope=\"personal\") 列出个人笔记。", hits: [] };
      }

      const classOut = wantClass ? await searchClassNotes(ctx, runtime, q, crossYear, subjectId, abortSignal) : null;
      if (classOut && classOut.text.startsWith("检索索引未加载") && !wantPersonal) return classOut;

      const personalOut = wantPersonal ? searchPersonalNotes(ctx, runtime, q, subjectId) : null;
      if (resolvedScope === "class") return classOut ?? { text: "未检索到相关课堂笔记。", hits: [] };
      if (resolvedScope === "personal") return personalOut ?? { text: "未检索到相关个人笔记。", hits: [] };

      const classFailedIndex = Boolean(classOut?.text.startsWith("检索索引未加载"));
      if (classFailedIndex && !(personalOut?.hits.length)) return classOut ?? { text: "检索索引未加载", hits: [] };
      if (classFailedIndex) return personalOut ?? { text: "未检索到相关个人笔记。", hits: [] };
      return mergeNoteResults(classOut, personalOut);
    },
    toModelOutput: ({ output }) => toText(output),
  });
}
