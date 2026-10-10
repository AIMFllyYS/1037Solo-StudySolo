"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import DeleteNoteDialog from "@/components/notes/DeleteNoteDialog";
import { motion } from "framer-motion";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import clsx from "clsx";
import { Download, List, MessageSquare, Quote, RefreshCw, Trash2 } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import NoteRenderer from "@/components/notes/NoteRenderer";
import NoteAgentPanel from "@/components/notes/NoteAgentPanel";
import NoteTocSidebar from "@/components/notes/NoteTocSidebar";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { useCiteToChat } from "@/components/notes/useCiteToChat";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { downloadAsMarkdown } from "@/lib/documents/export";
import { citeUserNoteToMainAgent, openAgentForUserNote } from "@/lib/notes/openUserNote";
import SubjectPickerMenu from "@/components/notes/SubjectPickerMenu";
import { formatNoteQuote, userNoteWindowId } from "@/lib/notes/userNote";
import { keepEditorShortcut } from "@/lib/notes/editor/editorShortcuts";
import {
  focusMarkdownLine,
  parseNoteToc,
  scrollCrepeHeading,
  type NoteTocItem,
} from "@/lib/notes/library/noteToc";
import { DURATION, EASE } from "@/lib/motion";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useT } from "@/lib/i18n";
import { shouldMountHeavyEditor } from "@/lib/window/heavyEditor";
import { useManagedWindowSurface } from "@/lib/window/useManagedWindowSurface";

type EditorMode = "source" | "wysiwyg" | "split";

const MODES: { id: EditorMode; labelKey: string }[] = [
  { id: "source", labelKey: "window.note.editor.modeSource" },
  { id: "wysiwyg", labelKey: "window.note.editor.modeWysiwyg" },
  { id: "split", labelKey: "window.note.editor.modeSplit" },
];

/** dynamic 的 loading 需要是组件（拿不到调用方的 t），单独包一层。 */
function CrepeLoading() {
  const t = useT();
  return <div className="user-note-crepe-loading">{t("window.note.common.editorLoading")}</div>;
}

const MilkdownNoteEditor = dynamic(() => import("@/components/notes/MilkdownNoteEditor"), {
  ssr: false,
  loading: () => <CrepeLoading />,
});

export default function UserNoteEditorWindow({ noteId }: { noteId: string }) {
  const note = useUserNotes((s) => s.byId[noteId]);
  const updateNote = useUserNotes((s) => s.updateNote);
  const removeNote = useUserNotes((s) => s.removeNote);
  const closeEditor = useUserNotes((s) => s.closeEditor);
  const agentOpen = useUserNotes((s) => s.noteAgentOpenIds.includes(noteId));
  const agentSessionId = useUserNotes((s) => s.noteAgentSessionById[noteId]);
  const windowId = userNoteWindowId(noteId);
  const activeWindowId = useWindowManager((s) => s.activeWindowId);
  const { presentation, visible } = useManagedWindowSurface(windowId);
  // 只在最前的笔记窗挂重编辑器；Agent 右栏还要求它真的在展示（没最小化、右栏没收起）。
  const isFront = shouldMountHeavyEditor(activeWindowId, windowId) && (presentation !== "dock" || visible);
  const [mode, setMode] = useState<EditorMode>("wysiwyg");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [wysiwygRev, setWysiwygRev] = useState(0);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const wysiwygHostRef = useRef<HTMLDivElement | null>(null);
  // 编辑器最后一次吐出的正文。Crepe 只在挂载时读 defaultValue，所以外部改动
  // （用户在确认卡点「同意修改」、云同步回灌）必须靠重挂才能显示出来；
  // 用它区分「用户自己打字」与「外部写入」，前者不重挂（否则丢光标）。
  const lastEmitted = useRef(note?.markdown ?? "");
  const { cited, cite } = useCiteToChat();
  const t = useT();

  const handleClose = useCallback(() => closeEditor(noteId), [closeEditor, noteId]);
  const handleMarkdown = useCallback(
    (markdown: string) => {
      lastEmitted.current = markdown;
      updateNote(noteId, { markdown });
    },
    [noteId, updateNote],
  );
  const refreshWysiwyg = useCallback(() => setWysiwygRev((n) => n + 1), []);
  // 划词工具栏「引用」：打开这篇笔记自己的「笔记对话」并写入它的引用槽，
  // 不走全局 quotedText（那条会落进右侧主对话）。
  const handleQuoteToNoteAgent = useCallback(
    (text: string) => {
      if (!openAgentForUserNote(noteId)) return;
      useChatUI.getState().setNoteQuote(noteId, text);
    },
    [noteId],
  );

  const noteMarkdown = note?.markdown ?? "";
  // split 模式每键全量预览+TOC 是主线程税：预览/TOC 走 deferred 值，
  // 输入优先级高于预览提交，长笔记打字不再被 KaTeX/TOC 扫描阻塞。
  // 必须在下方「if (!note) return null」之前调用，保证 hook 顺序在每次渲染恒定。
  const deferredMarkdown = useDeferredValue(note?.markdown ?? "");
  useEffect(() => {
    if (noteMarkdown === lastEmitted.current) return;
    lastEmitted.current = noteMarkdown;
    refreshWysiwyg();
  }, [noteMarkdown, refreshWysiwyg]);

  if (!note) return null;

  const tocItems = parseNoteToc(deferredMarkdown);
  const handleTocSelect = (item: NoteTocItem) => {
    if (mode === "source" && sourceRef.current) {
      focusMarkdownLine(sourceRef.current, item.line);
      return;
    }
    if (mode === "split" && sourceRef.current) {
      focusMarkdownLine(sourceRef.current, item.line);
    }
    scrollCrepeHeading(wysiwygHostRef.current, item.title);
  };

  const source = (
    <NoteSourcePane refEl={sourceRef} value={note.markdown} onChange={handleMarkdown} />
  );
  const preview = <NotePreviewPane markdown={deferredMarkdown} />;
  const wysiwyg = (
    <div ref={wysiwygHostRef} className="user-note-wysiwyg">
      <button
        type="button"
        data-no-drag
        className="user-note-refresh"
        title={t("window.note.editor.refreshRender")}
        aria-label={t("window.note.editor.refreshRender")}
        onClick={refreshWysiwyg}
      >
        <RefreshCw size={13} />
        <span>{t("window.note.editor.refresh")}</span>
      </button>
      {isFront ? (
        <MilkdownNoteEditor
          key={`${noteId}:${mode}:${wysiwygRev}`}
          value={note.markdown}
          onChange={handleMarkdown}
          onQuote={handleQuoteToNoteAgent}
        />
      ) : (
        <NotePreviewPane markdown={note.markdown} />
      )}
    </div>
  );

  const actions = (
    <div className="user-note-chrome-actions" data-no-drag>
      <div className="user-note-modes" role="group" aria-label={t("window.note.editor.modeGroup")}>
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-no-drag
            aria-pressed={mode === item.id}
            className={clsx("user-note-mode", mode === item.id && "is-active")}
            onClick={() => setMode(item.id)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-no-drag
        title={t("window.note.editor.citeToChat")}
        aria-label={t("window.note.editor.citeToChat")}
        className="user-note-chrome-btn"
        onClick={() => {
          if (citeUserNoteToMainAgent(noteId)) cite(formatNoteQuote(note));
        }}
      >
        <Quote size={14} />
        <span className="sr-only">{cited ? t("window.note.common.cited") : t("window.note.common.cite")}</span>
      </button>
      <button
        type="button"
        data-no-drag
        title={t("window.common.downloadMarkdown")}
        aria-label={t("window.common.downloadMarkdown")}
        className="user-note-chrome-btn"
        onClick={() => downloadAsMarkdown(note.markdown, note.title || t("window.note.common.untitled"))}
      >
        <Download size={14} />
      </button>
      <button
        type="button"
        data-no-drag
        title={t("window.note.editor.deleteNote")}
        aria-label={t("window.note.editor.deleteNote")}
        className="user-note-chrome-btn is-danger"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const editorBody = (
    <NoteEditorBody
      title={note.title}
      subjectId={note.subjectId}
      agentOpen={agentOpen}
      tocOpen={tocOpen}
      mode={mode}
      source={source}
      preview={preview}
      wysiwyg={wysiwyg}
      onTitleChange={(title) => updateNote(noteId, { title })}
      onSubjectChange={(next) => updateNote(noteId, { subjectId: next })}
      onToggleAgent={() => {
        if (agentOpen) useUserNotes.getState().setNoteAgentOpen(noteId, false);
        else openAgentForUserNote(noteId);
      }}
      onToggleToc={() => setTocOpen((open) => !open)}
    />
  );

  const workspace = (
    <div className="user-note-workspace">
      {tocOpen ? (
        <PanelGroup direction="horizontal" autoSaveId={`user-note-toc:${noteId}`} className="user-note-toc-split">
          <Panel defaultSize={22} minSize={14} maxSize={40} className="h-full min-h-0 min-w-0 overflow-hidden">
            <NoteTocSidebar items={tocItems} onSelect={handleTocSelect} onHide={() => setTocOpen(false)} />
          </Panel>
          <NoteResizeHandle />
          <Panel defaultSize={78} minSize={40} className="h-full min-h-0 min-w-0 overflow-hidden">
            {editorBody}
          </Panel>
        </PanelGroup>
      ) : (
        editorBody
      )}
    </div>
  );

  return (
    <ManagedWindow
      windowId={userNoteWindowId(noteId)}
      title={note.title || t("window.note.common.untitled")}
      icon={<NotebookFormulaIcon size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={agentOpen ? { minW: 720, minH: 400 } : { minW: 460, minH: 360 }}
      overlayId={`user-note-editor-${noteId}`}
      actions={actions}
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      {agentOpen ? (
        <PanelGroup direction="horizontal" autoSaveId="user-note-agent" className="user-note-with-agent">
          <Panel defaultSize={64} minSize={40} className="h-full min-h-0 min-w-0 overflow-hidden">
            {workspace}
          </Panel>
          <NoteResizeHandle />
          <Panel defaultSize={36} minSize={26} className="h-full min-h-0 min-w-0 overflow-hidden">
            <motion.div
              className="h-full min-h-0 min-w-0"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.sidebar, ease: EASE.decelerate }}
            >
              {agentSessionId ? (
                <NoteAgentPanel noteId={noteId} sessionId={agentSessionId} onSettled={refreshWysiwyg} />
              ) : null}
            </motion.div>
          </Panel>
        </PanelGroup>
      ) : (
        workspace
      )}

      {confirmDelete && typeof document !== "undefined" ? (
        <DeleteNoteDialog
          title={note.title || t("window.note.common.untitled")}
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

function NoteResizeHandle() {
  return (
    <PanelResizeHandle data-no-drag className="document-workspace-resize-handle group relative outline-none">
      <span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100">
        <span className="block h-7 w-1 rounded-full bg-[var(--md-sys-color-primary)]/50" />
      </span>
    </PanelResizeHandle>
  );
}

function NoteEditorBody({
  title,
  subjectId,
  agentOpen,
  tocOpen,
  mode,
  source,
  preview,
  wysiwyg,
  onTitleChange,
  onSubjectChange,
  onToggleAgent,
  onToggleToc,
}: {
  title: string;
  subjectId: string | null;
  agentOpen: boolean;
  tocOpen: boolean;
  mode: EditorMode;
  source: ReactNode;
  preview: ReactNode;
  wysiwyg: ReactNode;
  onTitleChange: (title: string) => void;
  onSubjectChange: (subjectId: string | null) => void;
  onToggleAgent: () => void;
  onToggleToc: () => void;
}) {
  const t = useT();
  return (
    <div className="user-note-editor">
      <div className="user-note-editor-head" data-no-drag>
        {!tocOpen ? (
          <button
            type="button"
            data-no-drag
            title={t("window.note.editor.showToc")}
            aria-label={t("window.note.editor.showToc")}
            className="user-note-chrome-btn"
            onClick={onToggleToc}
          >
            <List size={14} />
          </button>
        ) : null}
        <input
          className="user-note-title-input"
          value={title}
          placeholder={t("window.note.editor.titlePlaceholder")}
          aria-label={t("window.note.editor.titlePlaceholder")}
          onChange={(event) => onTitleChange(event.target.value)}
        />
        <button
          type="button"
          data-no-drag
          title={agentOpen ? t("window.note.editor.toggleAgentClose") : t("window.note.editor.toggleAgentOpen")}
          aria-label={t("window.note.editor.agentAria")}
          aria-pressed={agentOpen}
          className={clsx("user-note-chrome-btn user-note-editor-ai", agentOpen && "is-active")}
          onClick={onToggleAgent}
        >
          <MessageSquare size={14} />
        </button>
        <SubjectPickerMenu value={subjectId} allowUnfiled onChange={onSubjectChange} />
      </div>

      {mode === "split" ? (
        <PanelGroup direction="horizontal" autoSaveId="user-note-split" className="user-note-split">
          <Panel defaultSize={50} minSize={22} className="h-full min-h-0 min-w-0 overflow-hidden">
            {source}
          </Panel>
          <NoteResizeHandle />
          <Panel defaultSize={50} minSize={22} className="h-full min-h-0 min-w-0 overflow-hidden">
            {preview}
          </Panel>
        </PanelGroup>
      ) : (
        <div className="user-note-single">{mode === "source" ? source : wysiwyg}</div>
      )}
    </div>
  );
}

function NoteSourcePane({
  refEl,
  value,
  onChange,
}: {
  refEl: { current: HTMLTextAreaElement | null };
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    keepEditorShortcut(event);
    if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart, selectionEnd } = el;
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);
    const caret = selectionStart + 2;
    requestAnimationFrame(() => {
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <textarea
      ref={refEl}
      data-no-drag
      className="user-note-source"
      value={value}
      spellCheck={false}
      aria-label={t("window.note.common.markdownBody")}
      placeholder={t("window.note.editor.writingPlaceholder")}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

function NotePreviewPane({ markdown }: { markdown: string }) {
  const t = useT();
  return (
    <div className="user-note-preview prose-notes" data-no-drag>
      {markdown.trim() ? (
        <NoteRenderer content={markdown} />
      ) : (
        <p className="note-citation-status">{t("window.note.editor.emptyPreview")}</p>
      )}
    </div>
  );
}
