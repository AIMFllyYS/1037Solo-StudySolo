"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { StickyNote, Trash2 } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import SubjectPickerMenu from "@/components/notes/SubjectPickerMenu";
import YearSubjectFolderTree from "@/components/layout/navigation/YearSubjectFolderTree";
import ReviewNoteWorkspace from "@/components/review-mode/ReviewNoteWorkspace";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { userNoteWindowId } from "@/lib/notes/userNote";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { shouldMountHeavyEditor } from "@/lib/window/heavyEditor";
import { useManagedWindowSurface } from "@/lib/window/useManagedWindowSurface";
import { useT } from "@/lib/i18n";
import { captureReviewEditorOwner } from "@/lib/notes/reviewEditorOwner";

/** dynamic 的 loading 需要是组件（拿不到调用方的 t），单独包一层。 */
function CrepeLoading() {
  const t = useT();
  return <div className="user-note-crepe-loading">{t("window.note.common.stickyEditorLoading")}</div>;
}

const MilkdownNoteEditor = dynamic(() => import("@/components/notes/MilkdownNoteEditor"), {
  ssr: false,
  loading: () => <CrepeLoading />,
});

/** 划词「笔记」弹出的小便签：复用完整 Milkdown，只是窗小、正文靠左。 */
export default function ClassroomNoteWindow({ noteId }: { noteId: string }) {
  const note = useUserNotes((s) => s.byId[noteId]);
  const updateNote = useUserNotes((s) => s.updateNote);
  const removeNote = useUserNotes((s) => s.removeNote);
  const closeEditor = useUserNotes((s) => s.closeEditor);
  const hydratedOwnerEpoch = useUserNotes((s) => s._hydratedOwnerEpoch);
  const windowId = userNoteWindowId(noteId);
  const activeWindowId = useWindowManager((s) => s.activeWindowId);
  const { presentation, visible } = useManagedWindowSurface(windowId);
  // 只在最前的笔记窗挂重编辑器；Agent 右栏还要求它真的在展示（没最小化、右栏没收起）。
  const isFront = shouldMountHeavyEditor(activeWindowId, windowId) && (presentation !== "dock" || visible);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editorRev, setEditorRev] = useState(0);
  const t = useT();
  // 同 UserNoteEditorWindow：区分「便签自己打的字」与「外部写入」，只有后者才重挂。
  const lastEmitted = useRef(note?.markdown ?? "");

  const handleClose = useCallback(() => closeEditor(noteId), [closeEditor, noteId]);
  const handleMarkdown = useCallback(
    (markdown: string) => {
      lastEmitted.current = markdown;
      updateNote(noteId, { markdown });
    },
    [noteId, updateNote],
  );

  const noteMarkdown = note?.markdown ?? "";
  const isReviewSelection = note?.kind === "classroom" && note.source?.kind === "review";
  const reviewSubjectId = note?.subjectId ?? null;
  const reviewOwner = useMemo(
    () => captureReviewEditorOwner(noteId, hydratedOwnerEpoch),
    [noteId, hydratedOwnerEpoch],
  );
  const reviewNavigation = useMemo(
    () => isReviewSelection ? (
      <YearSubjectFolderTree
        key={reviewSubjectId ?? "unfiled"}
        selectedId={reviewSubjectId}
        onSelect={(subjectId) => {
          if (reviewOwner.isCurrent()) updateNote(noteId, { subjectId });
        }}
      />
    ) : null,
    [isReviewSelection, reviewSubjectId, noteId, reviewOwner, updateNote],
  );
  useEffect(() => {
    if (isReviewSelection) return;
    if (noteMarkdown === lastEmitted.current) return;
    lastEmitted.current = noteMarkdown;
    setEditorRev((n) => n + 1);
  }, [isReviewSelection, noteMarkdown]);

  if (!note) return null;

  return (
    <ManagedWindow
      windowId={userNoteWindowId(noteId)}
      title={note.title || t("window.note.common.classroom")}
      icon={<StickyNote size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={isReviewSelection ? { minW: 280, minH: 240 } : { minW: 280, minH: 220 }}
      overlayId={`classroom-note-${noteId}`}
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
      actions={!isReviewSelection ? (
        <button
          type="button"
          data-no-drag
          title={t("window.note.classroom.deleteNote")}
          aria-label={t("window.note.classroom.deleteNote")}
          className="user-note-chrome-btn is-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    >
      {isReviewSelection ? (
        <ReviewNoteWorkspace
          noteId={noteId}
          navigation={reviewNavigation}
          onRootClick={handleClose}
          rootLabel={t("review.notes.selectionRoot")}
          mountRichEditor={isFront}
        />
      ) : (
      <div className="classroom-note">
        <blockquote className="classroom-note-quote">
          <div className="classroom-note-quote-label">{t("window.note.classroom.quoteLabel")}</div>
          {note.quote?.trim() || t("window.note.common.noSelectionQuote")}
        </blockquote>
        <div className="classroom-note-head" data-no-drag>
          <input
            className="user-note-title-input"
            value={note.title}
            placeholder={t("window.note.classroom.titlePlaceholder")}
            aria-label={t("window.note.classroom.titleAria")}
            onChange={(event) => updateNote(noteId, { title: event.target.value })}
          />
          <SubjectPickerMenu
            value={note.subjectId}
            allowUnfiled
            onChange={(next) => updateNote(noteId, { subjectId: next })}
          />
        </div>
        <p className="classroom-note-meta">{note.source?.label || t("window.note.common.classroomAnnotation")}</p>
        {isFront ? (
          <MilkdownNoteEditor key={`${noteId}:${editorRev}`} value={note.markdown} onChange={handleMarkdown} compact />
        ) : (
          <textarea
            data-no-drag
            className="user-note-source"
            value={note.markdown}
            spellCheck={false}
            aria-label={t("window.note.classroom.annotationAria")}
            onChange={(event) => handleMarkdown(event.target.value)}
          />
        )}
      </div>
      )}

      {confirmDelete && typeof document !== "undefined" ? (
        <DeleteStickyDialog
          title={note.title || t("window.note.common.classroom")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            removeNote(noteId);
          }}
        />
      ) : null}
    </ManagedWindow>
  );
}

function DeleteStickyDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return createPortal(
    <div className="app-dialog-backdrop">
      <div role="alertdialog" aria-modal="true" aria-label={t("window.note.classroom.deleteDialogAria")} className="app-dialog">
        <div className="app-dialog-eyebrow">{t("window.note.common.deleteConfirmEyebrow")}</div>
        <h2>{t("window.note.common.deleteConfirmTitle", { title })}</h2>
        <p>{t("window.note.classroom.deleteDialogBody")}</p>
        <div className="user-note-dialog-actions">
          <button type="button" className="user-note-dialog-cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="app-dialog-confirm" onClick={onConfirm}>
            {t("window.common.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
