"use client";

import clsx from "clsx";
import { PanelLeftClose } from "lucide-react";
import type { NoteTocItem } from "@/lib/notes/library/noteToc";

export default function NoteTocSidebar({
  items,
  activeId,
  onSelect,
  onHide,
  ariaLabel = "笔记目录",
  heading = "目录",
  hideLabel = "隐藏目录",
  emptyLabel = "写上标题后会出现目录。",
}: {
  items: NoteTocItem[];
  activeId?: string | null;
  onSelect: (item: NoteTocItem) => void;
  onHide: () => void;
  ariaLabel?: string;
  heading?: string;
  hideLabel?: string;
  emptyLabel?: string;
}) {
  return (
    <nav className="user-note-toc" aria-label={ariaLabel}>
      <div className="user-note-toc-head" data-no-drag>
        <span>{heading}</span>
        <button
          type="button"
          data-no-drag
          className="user-note-chrome-btn"
          title={hideLabel}
          aria-label={hideLabel}
          onClick={onHide}
        >
          <PanelLeftClose size={13} />
        </button>
      </div>
      <div className="user-note-toc-list" data-no-drag>
        {items.length === 0 ? (
          <p className="user-note-toc-empty">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <button
              key={`${item.id}:${item.line}`}
              type="button"
              data-no-drag
              className={clsx("user-note-toc-item", `is-h${item.level}`, activeId === item.id && "is-active")}
              aria-current={activeId === item.id ? "location" : undefined}
              onClick={() => onSelect(item)}
            >
              {item.title}
            </button>
          ))
        )}
      </div>
    </nav>
  );
}
