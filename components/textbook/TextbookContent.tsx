"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import PlainTextReader from "@/components/notes/PlainTextReader";
import { NoteSkeleton } from "@/components/notes/NoteSkeleton";
import { ComponentRenderer } from "@/lib/content/componentRegistry";
import { useT } from "@/lib/i18n";
import { textbookSelectionKey, type TextbookSelection } from "@/lib/textbook/state";

const NoteRenderer = dynamic(() => import("@/components/notes/NoteRenderer"), { loading: () => <NoteSkeleton /> });
interface Section { content: string; format: "markdown" | "text" | "html" }
type Load = { key: string; status: "loading" | "done" | "missing" | "error"; section?: Section };

/** Agent 内的纯正文阅读器：复用 Studio 渲染器，不订阅或修改 Studio tabs / TOC。 */
export default function TextbookContent({ selection }: { selection: TextbookSelection | null }) {
  const t = useT();
  const cache = useRef(new Map<string, Section>());
  const [load, setLoad] = useState<Load | null>(null);
  const [retry, setRetry] = useState(0);
  const key = selection ? textbookSelectionKey(selection) : "";
  useEffect(() => {
    if (!selection || selection.item.renderType === "component") return;
    const cached = cache.current.get(key);
    if (cached) { setLoad({ key, status: "done", section: cached }); return; }
    const controller = new AbortController();
    setLoad({ key, status: "loading" });
    const params = new URLSearchParams({ subjectId: selection.subjectId, categoryId: selection.categoryId, itemId: selection.item.id });
    void fetch(`/api/section?${params}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`section_${response.status}`);
      const result = await response.json() as { content?: unknown; format?: unknown };
      if (controller.signal.aborted) return;
      if (typeof result.content !== "string" || !result.content.trim()) { setLoad({ key, status: "missing" }); return; }
      if (result.format !== "text" && result.format !== "html" && result.format !== "markdown") throw new Error("section_format_mismatch");
      const section = { content: result.content, format: result.format } as Section;
      cache.current.set(key, section);
      setLoad({ key, status: "done", section });
    }).catch(() => { if (!controller.signal.aborted) setLoad({ key, status: "error" }); });
    return () => controller.abort();
  }, [selection, key, retry]);
  const reader = useRef<HTMLDivElement>(null);
  useEffect(() => { reader.current?.scrollTo?.({ top: 0 }); }, [key]);
  if (!selection) return <div className="flex h-full items-center justify-center px-6 text-center text-[13px] leading-relaxed text-[var(--ink-soft)]" data-testid="textbook-reading-empty">{t("window.textbook.selectChapter")}</div>;
  const current = load?.key === key ? load : null;
  const section = current?.section;
  const hasBodyTitle = section?.format === "markdown" ? /^\s{0,3}#\s+\S/m.test(section.content) : section?.format === "html" ? /<h1(?:\s|>)/i.test(section.content) : false;
  return <div ref={reader} className="scroll-y h-full min-h-0 min-w-0" data-testid="textbook-reading-content" data-notes-root>
    <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="text-[12px] font-semibold text-[var(--accent)]">{selection.subjectName} · {selection.categoryName}</p>
      {(section && !hasBodyTitle || selection.item.renderType === "component") ? <h1 className="mb-5 mt-1 text-[22px] font-bold tracking-tight text-[var(--ink)]">{selection.item.title}</h1> : null}
      {selection.item.renderType === "component" ? <ComponentRenderer subjectId={selection.subjectId} categoryId={selection.categoryId} itemId={selection.item.id} />
        : !current || current.status === "loading" ? <NoteSkeleton />
        : current.status === "error" ? <div role="alert" className="text-[13px] text-[var(--ink-soft)]"><p>{t("window.state.readFailed")}</p><button type="button" className="press mt-3 rounded-lg border border-[var(--line)] px-3 py-2" onClick={() => setRetry((value) => value + 1)}>{t("window.textbook.retry")}</button></div>
        : current.status === "missing" ? <p className="text-[13px] text-[var(--ink-soft)]">{t(selection.item.children?.length ? "window.textbook.chooseSubsection" : "window.textbook.missingContent")}</p>
        : section?.format === "html" ? <iframe title={selection.item.title} srcDoc={section.content} sandbox={selection.item.materialRole === "notes" ? "allow-popups" : "allow-scripts allow-same-origin"} className="min-h-[60vh] w-full rounded-lg border border-[var(--line)]" />
        : section?.format === "text" ? <PlainTextReader content={section.content} />
        : section ? <div className="prose-notes"><NoteRenderer content={section.content} /></div> : null}
    </article>
  </div>;
}
