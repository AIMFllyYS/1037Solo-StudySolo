'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2 } from "lucide-react";
import type { CitationSource } from "@/lib/chat/sources/citationCatalog";
import { citationByIndex, parseCiteIndexes } from "@/lib/chat/sources/citationCatalog";
import { openCitationSource } from "@/lib/chat/sources/openCitation";
import { SourcePreviewRows, sourcePreviewMeta } from "@/components/chat/sources/SourcePreviewRows";
import { useT } from "@/lib/i18n/index";

export const CitationCatalogContext = createContext<CitationSource[]>([]);

function popoverPosition(anchor: DOMRect, estimatedHeight: number) {
  const width = Math.min(300, window.innerWidth - 16);
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = anchor.bottom + 8;
  const top = below + estimatedHeight > window.innerHeight
    ? Math.max(8, anchor.top - estimatedHeight - 8)
    : below;
  return { top, left, width };
}

function estimatedPopoverHeight(count: number): number {
  return Math.min(400, 44 + count * 92);
}

/**
 * 一簇 [n] / [n][m] 共用一张悬浮卡：只列出这一簇引用到的来源，
 * 排版复用 Agent 右上来源卡（编号 + 图标 + 标题 + 摘录 + host/path）。
 */
export function InlineCiteMarker({
  sources,
  catalog,
}: {
  sources: readonly CitationSource[];
  catalog: readonly CitationSource[];
}) {
  const t = useT();
  const popoverId = useId();
  const clusterRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const syncPos = useCallback(() => {
    const rect = clusterRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(popoverPosition(rect, estimatedPopoverHeight(sources.length)));
  }, [sources.length]);

  useEffect(() => {
    if (!open) return;
    syncPos();
    const onScroll = () => syncPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, syncPos]);

  if (!sources.length) return null;

  const items = sources.map((source) => ({
    key: `cite:${source.index}`,
    index: source.index,
    kind: source.kind,
    title: source.title.trim() || t("agent.citation.untitled"),
    snippet: source.snippet,
    meta: sourcePreviewMeta(source),
  }));

  return (
    <span
      ref={clusterRef}
      className="inline-cite-cluster"
      data-testid="inline-cite-cluster"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {sources.map((source) => {
        const title = source.title.trim() || t("agent.citation.untitled");
        return (
          <button
            key={source.index}
            type="button"
            className="inline-cite"
            data-testid="inline-cite"
            data-cite-index={source.index}
            aria-label={t("agent.citation.markerAria", { index: source.index, title })}
            aria-describedby={open ? popoverId : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openCitationSource(source, catalog);
            }}
          >
            {source.index}
          </button>
        );
      })}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={popoverId}
              role="tooltip"
              className="inline-cite-popover"
              data-testid="inline-cite-popover"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--line-soft)] px-3">
                <Link2 size={13} className="shrink-0 text-[var(--accent)]" />
                <span className="text-[12px] font-semibold text-[var(--ink)]">
                  {t("agent.sources.count", { count: sources.length })}
                </span>
              </header>
              <div className="flex max-h-[min(360px,50vh)] flex-col gap-1.5 overflow-auto p-2">
                <SourcePreviewRows
                  items={items}
                  onOpen={(item) => {
                    const source = sources.find((entry) => entry.index === item.index);
                    if (source) openCitationSource(source, catalog);
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export function CiteRef({
  indexes,
}: {
  indexes?: string;
  node?: unknown;
}) {
  const catalog = useContext(CitationCatalogContext);
  const nums = parseCiteIndexes(String(indexes ?? ""));
  const sources = nums
    .map((index) => citationByIndex(catalog, index))
    .filter((source): source is CitationSource => Boolean(source));
  if (!sources.length) return <span>[{indexes}]</span>;
  return <InlineCiteMarker sources={sources} catalog={catalog} />;
}
