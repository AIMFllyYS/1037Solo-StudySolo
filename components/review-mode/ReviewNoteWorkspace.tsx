"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useDeferredValue, type ReactNode } from "react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { ChevronRight, FileText, ListTree, PanelLeft, Plus, Trash2, X } from "lucide-react";
import DeleteNoteDialog from "@/components/notes/DeleteNoteDialog";
import NoteRenderer from "@/components/notes/NoteRenderer";
import NoteTocSidebar from "@/components/notes/NoteTocSidebar";
import SubjectPickerMenu from "@/components/notes/SubjectPickerMenu";
import { formatRelative } from "@/lib/scheduler/describe";
import { useUserNotes } from "@/lib/stores/userNotes";
import { subjectLabel } from "@/lib/notes/userNote";
import { captureReviewEditorOwner } from "@/lib/notes/reviewEditorOwner";
import { parseNoteToc, scrollCrepeHeading, type NoteTocItem } from "@/lib/notes/noteToc";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";

const MilkdownNoteEditor = dynamic(() => import("@/components/notes/MilkdownNoteEditor"), {
  ssr: false,
});

/** Shared Review document surface for the /review library and Review selection notes. */
function ReviewNoteWorkspace({
  noteId,
  navigation,
  onDeleted,
  onCreated,
  onRootClick,
  rootLabel,
  mountRichEditor = true,
}: {
  noteId: string | null;
  navigation?: ReactNode;
  onDeleted?: () => void;
  onCreated?: (id: string) => void;
  onRootClick?: () => void;
  rootLabel?: string;
  /** Floating note windows mount Crepe only while their managed surface is frontmost. */
  mountRichEditor?: boolean;
}) {
  const t = useT();
  const note = useUserNotes((s) => (noteId ? s.byId[noteId] : undefined));
  const updateNote = useUserNotes((s) => s.updateNote);
  const removeNote = useUserNotes((s) => s.removeNote);
  const createNote = useUserNotes((s) => s.createNote);
  const hydratedOwnerEpoch = useUserNotes((s) => s._hydratedOwnerEpoch);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [tocDrawerOpen, setTocDrawerOpen] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const workspaceId = useId();
  const [syncedNoteId, setSyncedNoteId] = useState(noteId);
  const [syncedOwnerEpoch, setSyncedOwnerEpoch] = useState(hydratedOwnerEpoch);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const navigationPaneRef = useRef<HTMLElement | null>(null);
  const navigationToggleRef = useRef<HTMLButtonElement | null>(null);
  const tocDrawerToggleRef = useRef<HTMLButtonElement | null>(null);
  const hadNavigationOpenRef = useRef(false);
  const lastEmittedMarkdownRef = useRef(note?.markdown ?? "");
  const currentNoteIdRef = useRef(noteId);
  const savedStatusTimerRef = useRef<number | null>(null);

  // Reset per-document UI state before showing another selection. This is the
  // same render-adjustment pattern used by the existing single-note editor.
  if (syncedNoteId !== noteId || syncedOwnerEpoch !== hydratedOwnerEpoch) {
    setSyncedNoteId(noteId);
    setSyncedOwnerEpoch(hydratedOwnerEpoch);
    setConfirmDelete(false);
    setStatus("idle");
    setActiveHeadingId(null);
    setNavigationOpen(false);
    setTocDrawerOpen(false);
    setTocOpen(true);
  }

  useEffect(() => {
    currentNoteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    if (navigationOpen) {
      hadNavigationOpenRef.current = true;
      navigationPaneRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    } else if (hadNavigationOpenRef.current) {
      hadNavigationOpenRef.current = false;
      navigationToggleRef.current?.focus({ preventScroll: true });
    }
  }, [navigationOpen]);

  const closeNavigationDrawer = useCallback(() => {
    setNavigationOpen(false);
    navigationToggleRef.current?.focus({ preventScroll: true });
  }, []);
  const closeTocDrawer = useCallback(() => {
    setTocDrawerOpen(false);
    tocDrawerToggleRef.current?.focus({ preventScroll: true });
  }, []);
  const closeTopDrawer = useCallback(() => {
    if (tocDrawerOpen) {
      closeTocDrawer();
      return;
    }
    if (navigationOpen) closeNavigationDrawer();
  }, [closeNavigationDrawer, closeTocDrawer, navigationOpen, tocDrawerOpen]);

  // The global shortcut provider can receive Esc before local key handlers.
  // Keep a higher-priority, per-workspace layer above the ManagedWindow layer.
  useOverlayRegistration({
    id: `review-note-drawer-${workspaceId}`,
    open: Boolean((navigation && navigationOpen) || (noteId && tocDrawerOpen)),
    onClose: closeTopDrawer,
    priority: 40,
  });

  const noteMarkdown = note?.markdown ?? "";
  const editorOwner = useMemo(
    () => captureReviewEditorOwner(noteId, hydratedOwnerEpoch),
    [noteId, hydratedOwnerEpoch],
  );
  const editorCanWrite = editorOwner.isCurrent();
  const editorKey = (noteId ?? "new") + ":" + editorOwner.key + ":" + editorRevision;
  const currentEditorKeyRef = useRef(editorKey);
  const lastConfirmedEditorKeyRef = useRef(editorKey);
  useLayoutEffect(() => {
    currentEditorKeyRef.current = editorKey;
  }, [editorKey]);
  const editorGuard = useCallback(
    () => editorOwner.isCurrent() && currentEditorKeyRef.current === editorKey,
    [editorOwner, editorKey],
  );
  const deferredMarkdown = useDeferredValue(noteMarkdown);
  const tocItems = useMemo(() => parseNoteToc(deferredMarkdown), [deferredMarkdown]);

  useLayoutEffect(() => {
    if (!note) {
      lastEmittedMarkdownRef.current = "";
      return;
    }
    if (lastConfirmedEditorKeyRef.current !== editorKey) {
      lastConfirmedEditorKeyRef.current = editorKey;
      lastEmittedMarkdownRef.current = noteMarkdown;
      return;
    }
    if (noteMarkdown === lastEmittedMarkdownRef.current) return;
    // Invalidate the old Crepe instance in layout, before the browser can deliver
    // another input callback against a remotely replaced document.
    lastEmittedMarkdownRef.current = noteMarkdown;
    setEditorRevision((revision) => revision + 1);
  }, [editorKey, noteId, noteMarkdown, note]);

  useEffect(
    () => () => {
      if (savedStatusTimerRef.current) window.clearTimeout(savedStatusTimerRef.current);
    },
    [],
  );

  const commitPatch = (patch: { title?: string; markdown?: string; subjectId?: string | null }) => {
    if (!noteId || !editorOwner.isCurrent()) return;
    setStatus("saving");
    // Apply each editor event to the existing owner-scoped store immediately;
    // the epoch guard rejects delayed callbacks after an account change, while
    // IDB/cloud sync keeps its existing queued persistence behavior.
    updateNote(noteId, patch);
    setNow(Date.now());
    setStatus("saved");
    if (savedStatusTimerRef.current) window.clearTimeout(savedStatusTimerRef.current);
    const savedForNote = noteId;
    savedStatusTimerRef.current = window.setTimeout(() => {
      if (currentNoteIdRef.current === savedForNote) setStatus("idle");
    }, 1600);
  };

  const selectHeading = (item: NoteTocItem) => {
    const itemIndex = tocItems.indexOf(item);
    const occurrence = tocItems
      .slice(0, itemIndex)
      .filter((candidate) => candidate.title === item.title).length;
    scrollCrepeHeading(editorHostRef.current, item.title, occurrence);
    setActiveHeadingId(item.id);
    setTocDrawerOpen(false);
  };

  if (!noteId || !note) {
    return (
      <div className="review-note-workspace-container">
        <div
          className={clsx("review-note-workspace", navigation && "has-navigation", "has-empty-document")}
          data-testid="review-note-workspace"
          data-navigation-open={navigationOpen || undefined}
        >
        {navigation ? (
          <aside
            ref={navigationPaneRef}
            className="review-note-navigation-pane"
            aria-label={t("review.notes.navigation")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeNavigationDrawer();
              }
            }}
          >
            <div className="review-note-navigation-content">
              <div className="review-note-mobile-pane-head">
                <span>{t("review.notes.navigation")}</span>
                <button type="button" aria-label={t("panel.common.close")} onClick={closeNavigationDrawer}>
                  <X size={15} />
                </button>
              </div>
              {navigation}
            </div>
          </aside>
        ) : null}
        <section className="review-note-editor-pane" aria-label={t("review.notes.breadcrumb")}>
          {navigation ? (
            <div className="review-note-empty-toolbar">
              <button
              type="button"
              ref={navigationToggleRef}
              className="review-note-mobile-toggle is-navigation"
                aria-label={navigationOpen ? t("review.notes.hideNavigation") : t("review.notes.showNavigation")}
                title={navigationOpen ? t("review.notes.hideNavigation") : t("review.notes.showNavigation")}
                aria-expanded={navigationOpen}
                onClick={() => {
                  setTocDrawerOpen(false);
                  setNavigationOpen((open) => !open);
                }}
              >
                <PanelLeft size={15} />
              </button>
            </div>
          ) : null}
          <div className="review-note-empty" data-testid="review-note-empty">
            <div className="review-note-empty-icon"><FileText size={22} /></div>
            <h2>{t("review.notes.emptyTitle")}</h2>
            <p>{t("review.notes.emptyBody")}</p>
            <button
              type="button"
              className="review-note-new-primary"
              disabled={!editorCanWrite}
              onClick={() => {
                if (!editorOwner.isCurrent()) return;
                const id = createNote(null);
                onCreated?.(id);
              }}
            >
              <Plus size={15} /> {t("review.notes.new")}
            </button>
            <p className="review-note-empty-hint">{t("review.notes.emptyPick")}</p>
          </div>
        </section>
        {navigationOpen ? (
          <button
            type="button"
            className="review-note-mobile-backdrop"
            aria-label={t("panel.common.close")}
            onClick={closeNavigationDrawer}
          />
        ) : null}
        </div>
      </div>
    );
  }

  const displayTitle = note.title.trim() || t("review.notes.untitled");
  const sourceRoot = rootLabel ?? t("review.notes.breadcrumb");

  return (
    <div className="review-note-workspace-container">
      <div
        className={clsx("review-note-workspace", navigation && "has-navigation")}
        data-testid="review-note-workspace"
        data-navigation-open={navigationOpen || undefined}
        data-toc-open={tocOpen || undefined}
        data-toc-drawer-open={tocDrawerOpen || undefined}
      >
      {navigation ? (
        <aside
          ref={navigationPaneRef}
          className="review-note-navigation-pane"
          aria-label={t("review.notes.navigation")}
          data-testid="review-note-navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeNavigationDrawer();
            }
          }}
        >
          <div className="review-note-navigation-content">
            <div className="review-note-mobile-pane-head">
              <span>{t("review.notes.navigation")}</span>
              <button type="button" aria-label={t("panel.common.close")} onClick={closeNavigationDrawer}>
                <X size={15} />
              </button>
            </div>
            {navigation}
          </div>
        </aside>
      ) : null}

      <section className="review-note-editor-pane" data-testid="review-note-editor">
        <div className="review-note-toolbar">
          <button
            type="button"
            ref={navigationToggleRef}
            className="review-note-mobile-toggle is-navigation"
            aria-label={navigationOpen ? t("review.notes.hideNavigation") : t("review.notes.showNavigation")}
            title={navigationOpen ? t("review.notes.hideNavigation") : t("review.notes.showNavigation")}
            aria-expanded={navigationOpen}
            onClick={() => {
              setTocDrawerOpen(false);
              setNavigationOpen((open) => !open);
            }}
          >
            <PanelLeft size={15} />
          </button>
          <nav className="review-note-breadcrumb" aria-label={t("review.notes.breadcrumb")}>
            <button
              type="button"
              className="review-note-breadcrumb-root"
              onClick={onRootClick}
              disabled={!onRootClick}
            >
              {sourceRoot}
            </button>
            <ChevronRight size={13} aria-hidden="true" />
            <SubjectPickerMenu
              key={editorKey}
              value={note.subjectId}
              allowUnfiled
              disabled={!editorCanWrite}
              onChange={(subjectId) => commitPatch({ subjectId })}
              className="review-note-breadcrumb-subject"
            />
            <ChevronRight size={13} aria-hidden="true" />
            <span className="review-note-breadcrumb-title" title={displayTitle}>{displayTitle}</span>
          </nav>
          <button
            type="button"
            className="review-note-desktop-toc-toggle"
            aria-label={tocOpen ? t("review.notes.hideToc") : t("review.notes.showToc")}
            title={tocOpen ? t("review.notes.hideToc") : t("review.notes.showToc")}
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((open) => !open)}
          >
            <ListTree size={15} />
          </button>
          <button
            type="button"
            ref={tocDrawerToggleRef}
            className="review-note-mobile-toggle is-toc"
            aria-label={tocDrawerOpen ? t("review.notes.hideToc") : t("review.notes.showToc")}
            title={tocDrawerOpen ? t("review.notes.hideToc") : t("review.notes.showToc")}
            aria-expanded={tocDrawerOpen}
            onClick={() => {
              setNavigationOpen(false);
              setTocDrawerOpen((open) => !open);
            }}
          >
            <ListTree size={15} />
          </button>
          <span className="review-note-save-status" data-testid="review-note-status" aria-live="polite">
            {status === "saving" ? t("review.notes.saving") : status === "saved" ? t("review.notes.saved") : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              if (editorOwner.isCurrent()) setConfirmDelete(true);
            }}
            title={t("review.notes.delete")}
            aria-label={t("review.notes.delete")}
            data-testid="review-note-delete"
            className="review-note-delete"
            disabled={!editorCanWrite}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="review-note-editor-scroll">
          <article className="review-note-document">
            {note.quote?.trim() ? (
              <blockquote className="review-note-quote">
                <span className="review-note-quote-label">{t("review.notes.quoteLabel")}</span>
                <span>{note.quote}</span>
              </blockquote>
            ) : null}
            <input
              key={editorKey}
              value={note.title}
              onChange={(event) => commitPatch({ title: event.target.value })}
              disabled={!editorCanWrite}
              placeholder={t("review.notes.titlePlaceholder")}
              aria-label={t("review.notes.titlePlaceholder")}
              data-testid="review-note-title"
              className="review-note-title-input"
            />
            <div className="review-note-document-meta">
              <span>{subjectLabel(note.subjectId)}</span>
              {note.source?.label ? <span>{note.source.label}</span> : null}
              <span>{t("review.notes.editedAt", { time: formatRelative(note.updatedAt, now, t) })}</span>
            </div>
            <div className="review-note-body" ref={editorHostRef}>
              {mountRichEditor ? (
                <MilkdownNoteEditor
                  key={editorKey}
                  value={note.markdown}
                  onChangeGuard={editorGuard}
                  onChange={(markdown) => {
                    const currentMarkdown = useUserNotes.getState().byId[noteId]?.markdown ?? "";
                    if (currentMarkdown !== lastEmittedMarkdownRef.current) {
                      lastEmittedMarkdownRef.current = currentMarkdown;
                      setEditorRevision((revision) => revision + 1);
                      return;
                    }
                    lastEmittedMarkdownRef.current = markdown;
                    commitPatch({ markdown });
                  }}
                />
              ) : (
                <div className="review-note-readonly-preview prose-notes">
                  <NoteRenderer content={deferredMarkdown} />
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      {tocOpen || tocDrawerOpen ? (
        <aside className="review-note-toc-pane" data-testid="review-note-toc">
          <NoteTocSidebar
            items={tocItems}
            activeId={activeHeadingId}
            onSelect={selectHeading}
            onHide={() => {
              setTocOpen(false);
              setTocDrawerOpen(false);
              tocDrawerToggleRef.current?.focus({ preventScroll: true });
            }}
            ariaLabel={t("review.notes.toc")}
            heading={t("review.notes.toc")}
            hideLabel={t("review.notes.hideToc")}
            emptyLabel={t("review.notes.tocEmpty")}
          />
        </aside>
      ) : null}

      {(navigationOpen || tocDrawerOpen) && (
        <button
          type="button"
          className="review-note-mobile-backdrop"
          aria-label={t("panel.common.close")}
          onClick={closeTopDrawer}
        />
      )}

      {confirmDelete ? (
        <DeleteNoteDialog
          title={displayTitle}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            if (!editorOwner.isCurrent()) return;
            removeNote(noteId);
            onDeleted?.();
          }}
        />
      ) : null}
      </div>
    </div>
  );
}

export default memo(ReviewNoteWorkspace);
