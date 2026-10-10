"use client";

import { BookOpen, Globe } from "lucide-react";
import { useT } from "@/lib/i18n/index";

export interface SourcePreviewItem {
  key: string;
  index: number;
  kind: "web" | "note";
  title: string;
  snippet?: string;
  meta: string;
}

/** 卡片副标题：网页取 host，笔记取面包屑路径。 */
export function sourcePreviewMeta(source: { kind: "web" | "note"; url?: string; path?: string }): string {
  if (source.kind === "note") return source.path || "";
  try {
    return new URL(source.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return source.url || "";
  }
}

/**
 * Agent 右上来源卡 / 正文 [n] 悬浮卡共用的来源行。
 * 排版锁在这一处：编号 + 图标 + 标题 + 摘录 + host/path。
 */
export function SourcePreviewRows({
  items,
  onOpen,
}: {
  items: readonly SourcePreviewItem[];
  onOpen: (item: SourcePreviewItem) => void;
}) {
  const t = useT();
  return (
    <>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onOpen(item)}
          title={t("agent.sources.openPanel")}
          className="press flex w-full min-w-0 flex-col gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] px-2.5 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--bg-muted)]"
        >
          <span className="flex min-w-0 items-start gap-1.5">
            <span className="mt-[1px] shrink-0 text-[11px] font-semibold tabular-nums text-[var(--ink-faint)]">
              {item.index}
            </span>
            {item.kind === "web" ? (
              <Globe size={13} className="mt-[2px] shrink-0 text-[var(--ink-faint)]" />
            ) : (
              <BookOpen size={13} className="mt-[2px] shrink-0 text-[var(--ink-faint)]" />
            )}
            <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-medium leading-[1.35] text-[var(--ink)]">
              {item.title}
            </span>
          </span>
          {item.snippet ? (
            <span className="line-clamp-3 pl-[18px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
              {item.snippet}
            </span>
          ) : null}
          <span className="truncate pl-[18px] text-[10.5px] text-[var(--ink-faint)]">
            {item.meta || t("agent.sources.noLink")}
          </span>
        </button>
      ))}
    </>
  );
}
