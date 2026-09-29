"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { Plus, Search, Trash2, FileText, ChevronRight } from "lucide-react";
import { useUserNotes, selectLibraryNotes } from "@/lib/stores/userNotes";
import { subjectLabel } from "@/lib/notes/userNote";
import { formatRelative } from "@/lib/scheduler/describe";
import DeleteNoteDialog from "@/components/notes/DeleteNoteDialog";
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
  // 列表里的相对时间以挂载时刻为基准（纯度规则不允许渲染期 Date.now()）。
  const [now] = useState(() => Date.now());

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
                      {subjectLabel(n.subjectId)} · {formatRelative(n.updatedAt, now, t)}
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

/**
 * 笔记编辑器（中心区）。Notion 式版式：
 * - 顶部一条细工具行：面包屑（复习笔记 / 学科）+ 保存状态 + 删除；
 * - 正文列居中限宽（与 Studio 正文同一阅读宽度），大标题直接写在正文列里，下面一行元信息；
 * - Milkdown 正文紧接标题，没有分隔框，写起来像一张纸。
 * 700ms 防抖自动保存；删除走全站同款二次确认弹窗。
 */
export function ReviewNoteEditor({
  noteId,
  onDeleted,
  onCreated,
}: {
  noteId: string | null;
  onDeleted: () => void;
  /** 空态「新建笔记」创建后直接打开它。 */
  onCreated?: (id: string) => void;
}) {
  const t = useT();
  const note = useUserNotes((s) => (noteId ? s.byId[noteId] : undefined));
  const updateNote = useUserNotes((s) => s.updateNote);
  const removeNote = useUserNotes((s) => s.removeNote);
  const createNote = useUserNotes((s) => s.createNote);

  const [title, setTitle] = useState(note?.title ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncedNoteId, setSyncedNoteId] = useState<string | null>(noteId);
  const saveTimer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  // 相对时间只在挂载 / 保存后刷新（纯度规则不允许渲染期 Date.now()）。
  const [now, setNow] = useState(() => Date.now());

  // 切换笔记时同步标题输入框（React 官方「渲染期依据 state 变化调整 state」模式）。
  if (syncedNoteId !== noteId) {
    setSyncedNoteId(noteId);
    setTitle(note?.title ?? "");
    setStatus("idle");
    setConfirmDelete(false);
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
      setNow(Date.now());
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setStatus("idle"), 1600);
    }, AUTOSAVE_MS);
  };

  if (!noteId || !note) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center text-center" data-testid="review-note-empty">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
            <FileText size={22} />
          </div>
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">{t("review.notes.emptyTitle")}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">{t("review.notes.emptyBody")}</p>
          <button
            type="button"
            onClick={() => {
              const id = createNote(null);
              onCreated?.(id);
            }}
            className="press mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] transition-[filter] duration-[var(--duration-fast)] hover:brightness-95"
          >
            <Plus size={15} />
            {t("review.notes.new")}
          </button>
          <p className="mt-3 text-[12px] text-[var(--ink-faint)]">{t("review.notes.emptyPick")}</p>
        </div>
      </div>
    );
  }

  const displayTitle = title.trim() || note.title.trim() || t("review.notes.untitled");

  return (
    <div className="flex h-full flex-col" data-testid="review-note-editor">
      {/* 细工具行：只放导航与状态，不和正文抢视线。 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--line-soft)] px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-[var(--ink-faint)]" aria-label={t("review.notes.breadcrumb")}>
          <span className="shrink-0">{t("review.notes.breadcrumb")}</span>
          <ChevronRight size={13} className="shrink-0" />
          <span className="shrink-0">{subjectLabel(note.subjectId)}</span>
          <ChevronRight size={13} className="shrink-0" />
          <span className="truncate text-[var(--ink-soft)]">{displayTitle}</span>
        </nav>
        <span
          className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--ink-faint)]"
          data-testid="review-note-status"
          aria-live="polite"
        >
          {status !== "idle" && (
            <span
              className={clsx("h-1.5 w-1.5 rounded-full", status === "saving" ? "animate-pulse bg-[var(--ink-faint)]" : "bg-[var(--accent)]")}
              aria-hidden
            />
          )}
          {status === "saving" ? t("review.notes.saving") : status === "saved" ? t("review.notes.saved") : ""}
        </span>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          title={t("review.notes.delete")}
          aria-label={t("review.notes.delete")}
          data-testid="review-note-delete"
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--bg-muted)] hover:text-[var(--md-sys-color-error)]"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10 sm:px-12">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave({ title: e.target.value });
            }}
            placeholder={note.title.trim() || t("review.notes.titlePlaceholder")}
            aria-label={t("review.notes.titlePlaceholder")}
            data-testid="review-note-title"
            className="w-full bg-transparent text-[30px] font-bold leading-tight tracking-tight text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-faint)]">
            <span className="rounded-md bg-[var(--bg-muted)] px-1.5 py-0.5 text-[var(--ink-soft)]">{subjectLabel(note.subjectId)}</span>
            <span>{t("review.notes.editedAt", { time: formatRelative(note.updatedAt, now, t) })}</span>
          </div>
          <div className="review-note-body mt-6">
            {/* key=noteId：换笔记时重挂编辑器载入新正文（MilkdownNoteEditor 只在挂载读入 value）。 */}
            <MilkdownNoteEditor
              key={noteId}
              value={note.markdown}
              onChange={(markdown) => scheduleSave({ markdown })}
            />
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteNoteDialog
          title={displayTitle}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            removeNote(noteId);
            onDeleted();
          }}
        />
      )}
    </div>
  );
}
