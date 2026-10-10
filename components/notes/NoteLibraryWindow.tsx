"use client";

import { useMemo, useState } from "react";
import { Check, PenLine, Plus, Quote } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import DocumentWorkspace from "@/components/window/DocumentWorkspace";
import YearSubjectFolderTree from "@/components/layout/navigation/YearSubjectFolderTree";
import NoteRenderer from "@/components/notes/NoteRenderer";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { useCiteToChat } from "@/components/notes/useCiteToChat";
import { useUserNotes, selectClassroomNotes, selectLibraryNotes } from "@/lib/stores/learning/userNotes";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { createAndOpenNote } from "@/lib/notes/openUserNote";
import { useT } from "@/lib/i18n";
import {
  formatClassroomNoteQuote,
  formatNoteQuote,
  plainSnippet,
  subjectLabel,
  USER_NOTE_LIBRARY_WINDOW_ID,
  type UserNote,
} from "@/lib/notes/userNote";

type LibraryTab = "mine" | "classroom";

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NoteLibraryWindow() {
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === USER_NOTE_LIBRARY_WINDOW_ID));
  const intent = useUserNotes((s) => s.libraryIntent);
  const subjectId = useUserNotes((s) => s.librarySubjectId);
  const byId = useUserNotes((s) => s.byId);
  const t = useT();
  const order = useUserNotes((s) => s.order);
  const openEditor = useUserNotes((s) => s.openEditor);
  const closeLibrary = useUserNotes((s) => s.closeLibrary);
  const setLibrarySubjectId = useUserNotes((s) => s.setLibrarySubjectId);

  const [tab, setTab] = useState<LibraryTab>("mine");
  const [query, setQuery] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const { cited, cite } = useCiteToChat();

  const keyword = query.trim().toLowerCase();

  const notes = useMemo(
    () => selectLibraryNotes(byId, order, subjectId, { includeExample: intent === "cite" }),
    [byId, intent, order, subjectId],
  );
  const visibleNotes = useMemo(
    () => (keyword ? notes.filter((note) => note.title.toLowerCase().includes(keyword)) : notes),
    [keyword, notes],
  );

  const classroomNotes = useMemo(
    () => selectClassroomNotes(byId, order, subjectId),
    [byId, order, subjectId],
  );
  const visibleClassroom = useMemo(
    () =>
      keyword
        ? classroomNotes.filter((note) => {
            const hay = `${note.title} ${note.quote ?? ""} ${note.source?.label ?? ""}`.toLowerCase();
            return hay.includes(keyword);
          })
        : classroomNotes,
    [classroomNotes, keyword],
  );

  const showTabs = intent === "cite";
  const activeTab: LibraryTab = showTabs ? tab : "mine";

  const activeNote =
    visibleNotes.find((note) => note.id === activeNoteId) ?? visibleNotes[0] ?? null;
  const activeClassroom =
    visibleClassroom.find((note) => note.id === activeClassroomId) ?? visibleClassroom[0] ?? null;

  if (!managed) return null;

  const handleCreate = () => {
    // 走公共入口，新笔记绑定左侧树当前选中的科目（「全部」时不归档）。
    const id = createAndOpenNote(subjectId);
    setActiveNoteId(id);
    setTab("mine");
  };

  const outline =
    activeTab === "mine"
      ? visibleNotes.map((note) => ({
          id: note.id,
          title: note.title || t("window.note.common.untitled"),
          meta: `${subjectLabel(note.subjectId)} · ${formatUpdatedAt(note.updatedAt)}`,
        }))
      : visibleClassroom.map((note) => ({
          id: note.id,
          kindLabel: note.source?.kind === "agent" ? "Agent" : note.source?.kind === "review" ? t("window.note.library.kindReview") : t("window.note.library.kindBody"),
          title: note.title || t("window.note.common.classroom"),
          meta: plainSnippet(note.quote || note.markdown, 60) || note.source?.label || t("window.note.common.classroomAnnotation"),
        }));

  const toolbar = (
    <div className="user-note-library-toolbar" data-no-drag>
      {showTabs ? (
        <div className="user-note-modes" role="group" aria-label={t("window.note.library.sourceGroup")}>
          <button
            type="button"
            data-no-drag
            aria-pressed={activeTab === "mine"}
            className={`user-note-mode${activeTab === "mine" ? " is-active" : ""}`}
            onClick={() => setTab("mine")}
          >
            {t("window.note.library.tabMine")}
          </button>
          <button
            type="button"
            data-no-drag
            aria-pressed={activeTab === "classroom"}
            className={`user-note-mode${activeTab === "classroom" ? " is-active" : ""}`}
            onClick={() => setTab("classroom")}
          >
            {t("window.note.library.tabClassroom")}
          </button>
        </div>
      ) : null}

      <input
        data-no-drag
        className="user-note-search is-offset"
        value={query}
        placeholder={t("window.note.library.searchPlaceholder")}
        aria-label={t("window.note.library.searchAria")}
        onChange={(event) => setQuery(event.target.value)}
      />

      <button type="button" data-no-drag className="user-note-toolbar-primary" onClick={handleCreate}>
        <Plus size={13} /> {t("window.note.library.newNote")}
      </button>
    </div>
  );

  return (
    <ManagedWindow
      windowId={USER_NOTE_LIBRARY_WINDOW_ID}
      title={managed.title}
      icon={<NotebookFormulaIcon size={15} />}
      onClose={closeLibrary}
      fullscreenTarget="notes"
      minSize={{ minW: 520, minH: 360 }}
      overlayId="user-note-library"
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      <DocumentWorkspace
        layoutKey="note-library"
        outlineLabel={activeTab === "mine" ? t("window.note.library.tabMine") : t("window.note.library.tabClassroom")}
        outline={outline}
        activeId={activeTab === "mine" ? (activeNote?.id ?? "") : (activeClassroom?.id ?? "")}
        onSelect={(id) => (activeTab === "mine" ? setActiveNoteId(id) : setActiveClassroomId(id))}
        toolbar={toolbar}
        emptyLabel={activeTab === "mine" ? t("window.note.library.emptyMine") : t("window.note.library.emptyClassroom")}
        folderTree={<YearSubjectFolderTree selectedId={subjectId} onSelect={setLibrarySubjectId} />}
      >
        {activeTab === "mine" ? (
          <UserNoteStage
            note={activeNote}
            cited={cited}
            onCite={(note) => cite(formatNoteQuote(note))}
            onOpen={(note) => openEditor(note.id)}
          />
        ) : (
          <ClassroomNoteStage note={activeClassroom} />
        )}
      </DocumentWorkspace>
    </ManagedWindow>
  );
}

function UserNoteStage({
  note,
  cited,
  onCite,
  onOpen,
}: {
  note: UserNote | null;
  cited: boolean;
  onCite: (note: UserNote) => void;
  onOpen: (note: UserNote) => void;
}) {
  const t = useT();
  if (!note) {
    return (
      <div className="user-note-stage">
        <p className="user-note-empty">{t("window.note.library.subjectEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="user-note-stage">
      <div className="user-note-stage-head">
        <div className="user-note-stage-title">{note.title || t("window.note.common.untitled")}</div>
        <div className="user-note-stage-meta">
          {subjectLabel(note.subjectId)} · {t("window.note.common.updatedAt", { time: formatUpdatedAt(note.updatedAt) })}
        </div>
        <div className="user-note-stage-actions" data-no-drag>
          <button type="button" data-no-drag className="user-note-action" onClick={() => onOpen(note)}>
            <PenLine size={13} /> {t("window.note.library.openEditor")}
          </button>
          <button type="button" data-no-drag className="user-note-action is-primary" onClick={() => onCite(note)}>
            {cited ? <Check size={13} /> : <Quote size={13} />} {cited ? t("window.note.common.cited") : t("window.note.common.cite")}
          </button>
        </div>
      </div>
      <div className="user-note-preview prose-notes">
        {note.markdown.trim() ? (
          <NoteRenderer content={note.markdown} />
        ) : (
          <p className="note-citation-status">{t("window.note.library.emptyNote")}</p>
        )}
      </div>
    </div>
  );
}

function ClassroomNoteStage({ note }: { note: UserNote | null }) {
  const { cited, cite } = useCiteToChat();
  const openEditor = useUserNotes((s) => s.openEditor);
  const t = useT();
  if (!note) {
    return (
      <div className="user-note-stage">
        <p className="user-note-empty">
          {t("window.note.library.classroomEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div className="user-note-stage">
      <div className="user-note-stage-head">
        <div className="user-note-stage-title">{note.title || t("window.note.common.classroom")}</div>
        <div className="user-note-stage-meta">
          {subjectLabel(note.subjectId)} · {note.source?.label || t("window.note.common.classroomAnnotation")} · {t("window.note.common.updatedAt", { time: formatUpdatedAt(note.updatedAt) })}
        </div>
        <div className="user-note-stage-actions" data-no-drag>
          <button type="button" data-no-drag className="user-note-action" onClick={() => openEditor(note.id)}>
            <PenLine size={13} /> {t("window.note.library.edit")}
          </button>
          <button
            type="button"
            data-no-drag
            className="user-note-action is-primary"
            onClick={() => cite(formatClassroomNoteQuote(note))}
          >
            {cited ? <Check size={13} /> : <Quote size={13} />} {cited ? t("window.note.common.cited") : t("window.note.common.cite")}
          </button>
        </div>
      </div>
      <div className="user-note-preview prose-notes">
        <blockquote className="classroom-note-quote">
          <div className="classroom-note-quote-label">{t("window.note.library.quoteLabel")}</div>
          {note.quote?.trim() || t("window.note.common.noSelectionQuote")}
        </blockquote>
        <div className="classroom-note-org">
          <div className="classroom-note-org-label">{t("window.note.library.orgLabel")}</div>
          <p className="classroom-note-org-line">{t("window.note.library.orgSubject", { subject: subjectLabel(note.subjectId) })}</p>
          <p className="classroom-note-org-line">{t("window.note.library.orgSource", { label: note.source?.label || t("window.note.library.sourceFallback") })}</p>
          {note.source?.path ? <p className="classroom-note-org-line">{t("window.note.library.orgPath", { path: note.source.path })}</p> : null}
          <p className="classroom-note-org-line">{t("window.note.library.orgUpdated", { time: formatUpdatedAt(note.updatedAt) })}</p>
        </div>
        {note.markdown.trim() ? (
          <NoteRenderer content={note.markdown} />
        ) : (
          <p className="note-citation-status">{t("window.note.library.emptyAnnotation")}</p>
        )}
      </div>
    </div>
  );
}
