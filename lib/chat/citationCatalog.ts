import type { SearchHit } from "@/lib/ai/agent/toolTypes";
import { getToolPartsByName } from "@/lib/chat/messageParts";
import type { ChatMessagePart } from "@/lib/types/chat";

export type CitationKind = "web" | "note";

export interface CitationSource {
  index: number;
  kind: CitationKind;
  title: string;
  snippet: string;
  url?: string;
  path?: string;
  /** 课堂文稿引用：点编号跳回那节课的那一段。 */
  classSegment?: { sessionId: string; segmentId: string };
}

export const INLINE_CITE_RE = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

export function parseCiteIndexes(raw: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > 99 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function snippetOf(text: string, fallback: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact;
}

function pathFromContextKey(key: string | undefined, prefix: "page" | "section"): string | null {
  if (!key?.startsWith(`${prefix}:`)) return null;
  const path = key.slice(prefix.length + 1);
  return path.includes("/") ? path : null;
}

function isCompleteOutput<T extends { state?: string; preliminary?: boolean; output?: { deduped?: boolean } | null }>(
  part: T,
): part is T & { state: "output-available"; output: NonNullable<T["output"]> } {
  return part.state === "output-available" && !part.preliminary && part.output != null && !part.output.deduped;
}

/**
 * 从本条助手消息的工具结果重建 [n] → 来源。
 * 优先用工具执行时写入的 citeIndex（并行工具完成顺序不会打乱编号）；
 * 旧消息没有编号时按 part 顺序兜底 1…N。
 */
export function collectCitationCatalog(parts: ChatMessagePart[]): CitationSource[] {
  const byIndex = new Map<number, CitationSource>();
  let fallback = 1;

  const add = (source: Omit<CitationSource, "index"> & { index?: number }) => {
    const index = source.index && source.index > 0 ? source.index : fallback;
    fallback = Math.max(fallback, index + 1);
    if (byIndex.has(index)) return;
    byIndex.set(index, { ...source, index });
  };

  for (const part of getToolPartsByName({ parts }, "getCurrentPage")) {
    if (!isCompleteOutput(part)) continue;
    const output = part.output;
    const path = output.path || pathFromContextKey(output.contextKey, "page");
    if (!path || output.found === false || path.split("/").filter(Boolean).length < 2) continue;
    const title = output.title?.trim() || path;
    add({
      index: output.citeIndex,
      kind: "note",
      title,
      path,
      snippet: snippetOf(output.text ?? "", title),
    });
  }

  for (const part of getToolPartsByName({ parts }, "getSection")) {
    if (!isCompleteOutput(part) || !part.output.found) continue;
    const output = part.output;
    const path = output.path || pathFromContextKey(output.contextKey, "section");
    if (!path) continue;
    const title = output.title?.trim() || path;
    add({
      index: output.citeIndex,
      kind: "note",
      title,
      path,
      snippet: snippetOf(output.text ?? "", title),
    });
  }

  for (const part of getToolPartsByName({ parts }, "searchNotes")) {
    if (!isCompleteOutput(part)) continue;
    for (const hit of part.output.hits ?? []) {
      if (!hit.path && !hit.citeIndex) continue;
      add({
        index: hit.citeIndex,
        kind: "note",
        title: hit.title || hit.path,
        path: hit.path,
        snippet: hit.snippet ?? "",
      });
    }
  }

  for (const part of getToolPartsByName({ parts }, "webSearch")) {
    if (!isCompleteOutput(part)) continue;
    for (const source of part.output.sources ?? []) {
      if (!source.url && !source.title && !source.citeIndex) continue;
      add({
        index: source.citeIndex,
        kind: "web",
        title: source.title || source.url,
        url: source.url ?? "",
        snippet: source.snippet ?? "",
      });
    }
  }

  for (const part of getToolPartsByName({ parts }, "searchClassTranscript")) {
    if (!isCompleteOutput(part)) continue;
    for (const hit of part.output.hits ?? []) {
      if (!hit.citeIndex) continue;
      add({
        index: hit.citeIndex,
        kind: "note",
        title: `《${hit.sessionTitle}》课堂文稿`,
        snippet: snippetOf(hit.text, hit.sessionTitle),
        classSegment: { sessionId: hit.sessionId, segmentId: hit.segmentId },
      });
    }
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

export function citationByIndex(catalog: readonly CitationSource[], index: number): CitationSource | undefined {
  return catalog.find((source) => source.index === index);
}

export function noteHitsFromCatalog(catalog: readonly CitationSource[]): SearchHit[] {
  return catalog
    .filter((source) => source.kind === "note" && source.path)
    .map((source) => ({
      title: source.title,
      path: source.path!,
      snippet: source.snippet,
    }));
}

export function isHttpUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
