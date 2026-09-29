"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { Plus, Search, Trash2, FileText } from "lucide-react";
import { useUserNotes, selectLibraryNotes } from "@/lib/stores/userNotes";
import { subjectLabel } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";

const MilkdownNoteEditor = dynamic(() => import("@/components/notes/MilkdownNoteEditor"), {
  ssr: false,
});

const AUTOSAVE_MS = 700;

/** 笔记列表（渲染进侧栏 children）。 */
export function ReviewNotesList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const byId = useUserNotes((s) => s.byId);
  const order = useUserNotes((s) => s.order);
  const createNote = useUserNotes((s) => s.createNote);
  const [query, setQuery] = useState("");

  const notes = useMemo(() => {
    const all = selectLibraryNotes(byId, order, null, { includeExample: true });
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (n) => n.title.toLowerCase().includes(q) || n.markdown.toLowerCase().includes(q),
    );
  }, [byId, order, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("review.notes.search")}
            aria-label={t("review.notes.search")}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-app)] py-1.5 pl-7 pr-2 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => onSelect(createNote(null))}
          title={t("review.notes.new")}
          aria-label={t("review.notes.new")}
          data-testid="review-note-new"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-weak)] text-[var(--accent-ink)] hover:brightness-95"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {notes.length === 0 ? (
          <p className="px-2 py-4 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            {t("review.notes.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelect(n.id)}
                  aria-current={n.id === activeId ? "true" : undefined}
                  data-testid="review-note-item"
                  className={clsx(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                    n.id === activeId
                      ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                      : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
                  )}
                >
                  <FileText size={14} className="mt-0.5 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {n.title.trim() || t("review.notes.untitled")}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--ink-faint)]">
                      {subjectLabel(n.subjectId)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 笔记编辑器（中心区）。Notion 式：标题 + Milkdown 正文，700ms 防抖自动保存。 */
export function ReviewNoteEditor({ noteId, onDeleted }: { noteId: string | null; onDeleted: () => void }) {
  const t = useT();
  const note = useUserNotes((s) => (noteId ? s.byId[noteId] : undefined));
  const updateNote = useUserNotes((s) => s.updateNote);
  const removeNote = useUserNotes((s) => s.removeNote);

  const [title, setTitle] = useState(note?.title ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [syncedNoteId, setSyncedNoteId] = useState<string | null>(noteId);
  const saveTimer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);

  // 切换笔记时同步标题输入框（React 官方「渲染期依据 state 变化调整 state」模式）。
  if (syncedNoteId !== noteId) {
    setSyncedNoteId(noteId);
    setTitle(note?.title ?? "");
    setStatus("idle");
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const scheduleSave = (patch: { title?: string; markdown?: string }) => {
    if (!noteId) return;
    setStatus("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      updateNote(noteId, patch);
      setStatus("saved");
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setStatus("idle"), 1600);
    }, AUTOSAVE_MS);
  };

  if (!noteId || !note) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--ink-faint)]">
          {t("review.notes.emptyPick")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="review-note-editor">
      <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-5 py-3">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value });
          }}
          placeholder={note?.title?.trim() || t("review.notes.titlePlaceholder")}
          aria-label={t("review.notes.titlePlaceholder")}
          data-testid="review-note-title"
          className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none"
        />
        <span className="shrink-0 text-[11px] text-[var(--ink-faint)]" data-testid="review-note-status">
          {status === "saving" ? t("review.notes.saving") : status === "saved" ? t("review.notes.saved") : ""}
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("review.notes.deleteConfirm"))) {
              removeNote(noteId);
              onDeleted();
            }
          }}
          title={t("review.notes.delete")}
          aria-label={t("review.notes.delete")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--md-sys-color-error)]"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {/* key=noteId：换笔记时重挂编辑器载入新正文（MilkdownNoteEditor 只在挂载读入 value）。 */}
        <MilkdownNoteEditor
          key={noteId}
          value={note.markdown}
          onChange={(markdown) => scheduleSave({ markdown })}
        />
      </div>
    </div>
  );
}
