"use client";

import { useEffect, useRef, useState } from "react";
import AgentSessionRow from "./AgentSessionRow";
import { useT } from "@/lib/i18n";
import type { SessionMeta } from "@/lib/storage/chatStorage";

/** 每次渲染/续载的条数（用户口径：默认一次 10 个，继续下滑再 10 个）。 */
export const SESSION_PAGE_SIZE = 10;

/**
 * 会话列表：一次 10 条，底部哨兵滚进视口就再放 10 条。
 * 没有 IntersectionObserver 时（jsdom / 老浏览器）哨兵变成可点按钮，键盘用户也够得着。
 * 父组件用 key={slot} 让切换分组时页数重置。
 */
export default function AgentSessionList({
  sessions,
  activeSessionId,
  emptyLabel,
  slot,
  depth = 1,
  inFolder = false,
  renamingId,
  onSelect,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
}: {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  emptyLabel: string;
  /** 列表标识（main / project-xxx），用于 testid 与分页作用域。 */
  slot: string;
  depth?: number;
  inFolder?: boolean;
  renamingId: string | null;
  onSelect: (session: SessionMeta) => void;
  onContextMenu: (event: React.MouseEvent, session: SessionMeta) => void;
  onRenameSubmit: (id: string, title: string) => void;
  onRenameCancel: () => void;
}) {
  const t = useT();
  const [limit, setLimit] = useState(SESSION_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = sessions.length > limit;
  const [observerUnsupported, setObserverUnsupported] = useState(false);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setObserverUnsupported(true);
      return;
    }
    const root = node.closest("[data-agent-scroll]") as HTMLElement | null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((n) => n + SESSION_PAGE_SIZE);
      },
      { root, rootMargin: "120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, sessions.length]);

  if (sessions.length === 0) {
    return <div className="px-8 py-1.5 text-[12px] text-[var(--ink-faint)]">{emptyLabel}</div>;
  }

  const visible = sessions.slice(0, limit);
  const hidden = sessions.length - visible.length;

  return (
    <>
      {visible.map((session) => (
        <AgentSessionRow
          key={session.id}
          session={session}
          depth={depth}
          inFolder={inFolder}
          selected={session.id === activeSessionId}
          renaming={renamingId === session.id}
          onSelect={() => onSelect(session)}
          onContextMenu={(event) => onContextMenu(event, session)}
          onRenameSubmit={(title) => onRenameSubmit(session.id, title)}
          onRenameCancel={onRenameCancel}
        />
      ))}
      <div ref={sentinelRef} data-testid={`session-load-more-${slot}`} className="h-px" aria-hidden="true" />
      {hidden > 0 && observerUnsupported ? (
        <button
          type="button"
          onClick={() => setLimit((n) => n + SESSION_PAGE_SIZE)}
          className="press mx-2 my-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-[var(--ink-faint)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--ink-soft)]"
        >
          <span className="tracking-[0.15em]">···</span>
          <span>{t("agent.sidebar.more", { count: hidden })}</span>
        </button>
      ) : null}
    </>
  );
}