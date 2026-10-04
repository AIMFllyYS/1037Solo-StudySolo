"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { FileText, Plus, Search } from "lucide-react";
import YearSubjectFolderTree from "@/components/layout/YearSubjectFolderTree";
import ReviewNoteWorkspace from "./ReviewNoteWorkspace";
import { selectLibraryNotes, useUserNotes } from "@/lib/stores/userNotes";
import { userNoteMatchesQuery } from "@/lib/notes/userNoteSearch";
import { isReviewNoteOwnerReady } from "@/lib/notes/reviewEditorOwner";
import { subjectLabel } from "@/lib/notes/userNote";
import { formatRelative } from "@/lib/scheduler/describe";
import { useT } from "@/lib/i18n";

/** Subject folders plus a virtualized note list for the shared Review workspace. */
export function ReviewNotesList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const order = useUserNotes((state) => state.order);
  const libraryRevision = useUserNotes((state) => state.libraryRevision);
  const hydratedOwnerEpoch = useUserNotes((state) => state._hydratedOwnerEpoch);
  const activeSubject = useUserNotes((state) => (activeId ? state.byId[activeId]?.subjectId : undefined));
  const createNote = useUserNotes((state) => state.createNote);
  const [subjectId, setSubjectId] = useState<string | null>(activeSubject ?? null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [now] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  useEffect(() => {
    if (activeId && activeSubject !== undefined) setSubjectId(activeSubject);
  }, [activeId, activeSubject]);

  const notes = useMemo(() => {
    const state = useUserNotes.getState();
    const currentOrder = state.libraryRevision === libraryRevision ? order : state.order;
    return selectLibraryNotes(state.byId, currentOrder, subjectId, { includeExample: subjectId === null });
  }, [libraryRevision, order, subjectId]);

  const visibleNotes = useMemo(
    () => normalizedQuery ? notes.filter((note) => userNoteMatchesQuery(note, normalizedQuery)) : notes,
    [notes, normalizedQuery],
  );

  // TanStack Virtual intentionally exposes a mutable measurement instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 50,
    overscan: 8,
    getItemKey: (index) => visibleNotes[index]?.id ?? index,
  });

  useEffect(() => {
    const activeIndex = visibleNotes.findIndex((note) => note.id === activeId);
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeId, visibleNotes, virtualizer]);

  const handleSubjectSelect = (nextSubjectId: string | null) => {
    setSubjectId(nextSubjectId);
    const state = useUserNotes.getState();
    const first = selectLibraryNotes(state.byId, state.order, nextSubjectId, {
      includeExample: nextSubjectId === null,
    })[0];
    onSelect(first?.id ?? null);
  };

  const handleCreate = () => {
    if (!isReviewNoteOwnerReady(useUserNotes.getState()._hydratedOwnerEpoch)) return;
    onSelect(createNote(subjectId));
  };
  const canCreateNote = isReviewNoteOwnerReady(hydratedOwnerEpoch);

  return (
    <div
      className="review-note-navigation review-sidebar-note-navigation"
      data-testid="review-note-navigation"
      role="region"
      aria-label={t("review.notes.navigation")}
    >
      <div className="review-note-subject-tree">
        <YearSubjectFolderTree selectedId={subjectId} onSelect={handleSubjectSelect} />
      </div>
      <section className="review-note-list-pane" aria-label={t("review.notes.title")}>
        <div className="review-note-list-toolbar">
          <div className="review-note-search-wrap">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("review.notes.search")}
              aria-label={t("review.notes.search")}
              data-testid="review-note-search"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            title={t("review.notes.new")}
            aria-label={t("review.notes.new")}
            data-testid="review-note-new"
            className="review-note-new-icon"
            disabled={!canCreateNote}
          >
            <Plus size={16} />
          </button>
        </div>
        {visibleNotes.length === 0 ? (
          <p className="review-note-list-empty">{t("review.notes.emptyList")}</p>
        ) : (
          <div ref={scrollRef} className="review-note-list-scroll" data-testid="review-note-list-scroll">
            <div className="review-note-list-virtual" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const note = visibleNotes[virtualRow.index];
                if (!note) return null;
                return (
                  <ReviewNoteRow
                    key={note.id}
                    noteId={note.id}
                    active={note.id === activeId}
                    now={now}
                    t={t}
                    refCallback={virtualizer.measureElement}
                    virtualIndex={virtualRow.index}
                    start={virtualRow.start}
                    onSelect={() => onSelect(note.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewNoteRow({
  noteId,
  active,
  now,
  t,
  refCallback,
  virtualIndex,
  start,
  onSelect,
}: {
  noteId: string;
  active: boolean;
  now: number;
  t: ReturnType<typeof useT>;
  refCallback: (element: Element | null) => void;
  virtualIndex: number;
  start: number;
  onSelect: () => void;
}) {
  const title = useUserNotes((state) => state.byId[noteId]?.title);
  const subjectId = useUserNotes((state) => state.byId[noteId]?.subjectId);
  const updatedAt = useUserNotes((state) => state.byId[noteId]?.updatedAt);
  if (title === undefined || updatedAt === undefined) return null;

  return (
    <div
      ref={refCallback as (node: HTMLDivElement | null) => void}
      data-index={virtualIndex}
      className="review-note-virtual-row"
      style={{ transform: `translateY(${start}px)` }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        data-testid="review-note-item"
        data-note-id={noteId}
        className={clsx("review-note-list-item", active && "is-active")}
      >
        <FileText size={14} className="mt-0.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">
            {title.trim() || t("review.notes.untitled")}
          </span>
          <span className="block truncate text-[11px] text-[var(--ink-faint)]">
            {subjectLabel(subjectId ?? null)} · {formatRelative(updatedAt, now, t)}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Compatibility adapter retained for callers and the focused component tests. */
export function ReviewNoteEditor({
  noteId,
  onDeleted,
  onCreated,
  navigation,
  onRootClick,
  rootLabel,
  mountRichEditor,
}: {
  noteId: string | null;
  onDeleted: () => void;
  onCreated?: (id: string) => void;
  navigation?: ReactNode;
  onRootClick?: () => void;
  rootLabel?: string;
  mountRichEditor?: boolean;
}) {
  return (
    <ReviewNoteWorkspace
      noteId={noteId}
      navigation={navigation}
      onDeleted={onDeleted}
      onCreated={onCreated}
      onRootClick={onRootClick}
      rootLabel={rootLabel}
      mountRichEditor={mountRichEditor}
    />
  );
}
