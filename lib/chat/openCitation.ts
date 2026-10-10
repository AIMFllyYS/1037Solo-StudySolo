import type { CitationSource } from "@/lib/chat/citationCatalog";
import { isHttpUrl, noteHitsFromCatalog } from "@/lib/chat/citationCatalog";
import { openSourcePreview } from "@/lib/chat/openSourcePreview";
import { openSourceTrace, sourceItemKey } from "@/lib/chat/openSourceTrace";
import { parseNotePath } from "@/lib/content/notePath";
import { useNoteCitations } from "@/lib/stores/learning/noteCitations";
import { openClassSegment } from "@/lib/class/jump";

function citationToTraceSource(source: CitationSource) {
  if (source.kind === "web") {
    return {
      kind: "web" as const,
      title: source.title,
      url: source.url ?? "",
      snippet: source.snippet,
    };
  }
  return {
    kind: "note" as const,
    title: source.title,
    path: source.path ?? "",
    snippet: source.snippet,
  };
}

/** 点内联 [n]：网页开预览窗，教材开笔记引用窗，其余走来源追踪。 */
export function openCitationSource(source: CitationSource, catalog: readonly CitationSource[] = []) {
  if (source.classSegment) {
    openClassSegment(source.classSegment);
    return;
  }

  if (source.kind === "web" && isHttpUrl(source.url)) {
    openSourcePreview({ url: source.url, title: source.title });
    return;
  }

  if (source.kind === "note" && source.path && parseNotePath(source.path)) {
    const hits = noteHitsFromCatalog(catalog.length ? catalog : [source]);
    const list = hits.some((hit) => hit.path === source.path)
      ? hits
      : [{ title: source.title, path: source.path, snippet: source.snippet }, ...hits];
    useNoteCitations.getState().openViewer(list, source.path);
    return;
  }

  const item = citationToTraceSource(source);
  openSourceTrace([item], { activeKey: sourceItemKey(item, 0) });
}
