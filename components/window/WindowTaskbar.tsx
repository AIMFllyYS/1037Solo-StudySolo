"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Plus, Upload, BookOpen, Layers, FileDigit, FolderTree, MonitorPlay } from "lucide-react";
import { useWindowManager, type ManagedWindow } from "@/lib/stores/workspace/windowManager";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { createAndOpenNote, openArtifactImportPicker, openDocumentImportPicker, openFlashcardCitePicker, openNoteLibrary } from "@/lib/notes/openUserNote";
import OverflowMenu from "@/components/window/OverflowMenu";
import { WindowTypeIcon } from "@/components/window/WindowTypeIcon";
import { fileTypeAccent } from "@/components/icons/file-types/FileTypeIcon";
import { ACCEPTED_DOCUMENT_FILE_TYPES } from '@/lib/ai/images/imageUtils';
import { registerLocalFile } from '@/lib/local-files/client';
import { attachmentPreviewKind } from "@/lib/chat/attachments/attachmentPreviewKind";
import { openAttachmentPreview } from "@/lib/chat/attachments/openAttachmentPreview";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useAppMode } from "@/lib/stores/appMode";
import { useProjectFilesEntry } from "@/components/project/useProjectFilesEntry";
import { openTextbookWindow } from "@/lib/textbook/openTextbook";
import { filterWindowsForSession, useActiveChatSessionId } from "@/lib/window/sessionScope";
import OpenUrlField from "@/components/window/OpenUrlDialog";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import AgentDockTabs from "@/components/window/AgentDockTabs";
import { useT } from "@/lib/i18n";

interface WindowTaskbarProps {
  host: "topbar" | "content-tab" | "right-panel";
}

const ICON_SLOT = 32;

type TaskbarTooltip = {
  win: ManagedWindow;
  right: number;
  top: number;
};

function taskbarAccent(win: ManagedWindow): string | undefined {
  if (win.type !== "attachment-preview") return undefined;
  return fileTypeAccent(win.data as { kind?: string; mimeType?: string; name?: string });
}

function FileErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return createPortal(
    <div className="app-dialog-backdrop">
      <div role="alertdialog" aria-modal="true" aria-label={t("panel.fileError.aria")} className="app-dialog">
        <div className="app-dialog-eyebrow">{t("panel.fileError.eyebrow")}</div>
        <h2>{t("panel.fileError.title")}</h2>
        <p>{message}</p>
        <button type="button" className="app-dialog-confirm" onClick={onClose}>{t("panel.fileError.confirm")}</button>
      </div>
    </div>,
    document.body,
  );
}

function AddMenuDivider() {
  return <div className="my-1 border-t border-[var(--line)]" data-menu-divider="" />;
}

export function AddContentButton({
  showUrlField = true,
  buttonFocusRef,
}: {
  showUrlField?: boolean;
  buttonFocusRef?: MutableRefObject<HTMLButtonElement | null>;
} = {}) {
  const t = useT();
  const agentMode = useAppMode((s) => s.mode === "agent");
  const [open, setOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { openProjectFilesEntry, projectRequiredDialog } = useProjectFilesEntry();
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const attachButtonRef = useCallback((node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (buttonFocusRef) buttonFocusRef.current = node;
  }, [buttonFocusRef]);

  const updateMenuPosition = () => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;
    const rect = button.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // 附属菜单优先于承载它的面板：Esc 先关菜单，不误关左侧面板。
  useOverlayRegistration({
    id: "window-taskbar-add-menu",
    open,
    onClose: () => setOpen(false),
    priority: 62,
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    updateMenuPosition();
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const handleFiles = async (files: File[], handles?:FileSystemFileHandle[]) => {
    for (const [index,file] of files.entries()) {
      try {
        const id = await registerLocalFile(file, useChatHistory.getState().activeSessionId,undefined,handles?.[index]);
        const kind = attachmentPreviewKind({ name: file.name, mimeType: file.type });
        openAttachmentPreview('local:' + id, { localFileId: id, name: file.name, mimeType: file.type, kind, content: kind === 'pdf' || kind === 'image' ? 'blob:local-source' : '', file });
      } catch (error) { setFileError(error instanceof Error ? error.message : '本地文件打开失败。'); }
    }
    setOpen(false);
  };
  const pickLocalFiles=async()=>{
    const picker=(window as unknown as {showOpenFilePicker?: (options:{multiple:boolean})=>Promise<FileSystemFileHandle[]>}).showOpenFilePicker;
    if(!picker){fileRef.current?.click();return;}
    try{const handles=await picker({multiple:true});const files=await Promise.all(handles.map(handle=>handle.getFile()));await handleFiles(files,handles);}
    catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setFileError(error instanceof Error?error.message:'文件选择失败。');}
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={attachButtonRef}
        type="button"
        aria-label={t("panel.addMenu.addContent")}
        aria-expanded={open}
        title={t("panel.addMenu.addContentHint")}
        data-testid="window-taskbar-add-content"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) requestAnimationFrame(updateMenuPosition);
            return next;
          });
        }}
        className={clsx(
          "window-taskbar-add relative flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-all",
          open
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]"
            : "border-[color-mix(in_srgb,var(--md-sys-color-primary)_42%,var(--line))] bg-[var(--bg-elevated)] text-[var(--md-sys-color-primary)] hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--bg-muted)]",
        )}
      >
        <Plus size={15} strokeWidth={2.3} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={`image/jpeg,image/png,image/gif,image/webp,${ACCEPTED_DOCUMENT_FILE_TYPES}`}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) void handleFiles(files);
        }}
      />
      {open && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("panel.addMenu.addContent")}
          style={{ position: "fixed", top: menuPosition.top, right: menuPosition.right }}
          className="window-taskbar-add-menu z-[12000] w-64 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-2 shadow-xl"
        >
          {agentMode && (
            <>
              <div role="group" aria-label={t("panel.addMenu.projectAria")} data-menu-group="project-files">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="add-menu-project-files"
                  onClick={() => {
                    setOpen(false);
                    openProjectFilesEntry();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                >
                  <FolderTree size={14} className="text-[var(--md-sys-color-primary)]" />
                  <span><strong className="font-semibold">{t("panel.addMenu.projectFiles")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.projectFilesHint")}</small></span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="add-menu-textbook"
                  onClick={() => {
                    setOpen(false);
                    openTextbookWindow();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                >
                  <BookOpen size={14} className="text-[var(--md-sys-color-primary)]" />
                  <span><strong className="font-semibold">{t("panel.addMenu.textbook")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.textbookHint")}</small></span>
                </button>
              </div>
              <AddMenuDivider />
            </>
          )}
          <div role="group" aria-label={t("panel.addMenu.openPanelsAria")} data-menu-group="open-panels">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openNoteLibrary({ intent: "cite" });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <BookOpen size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.pickNote")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.pickNoteHint")}</small></span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openFlashcardCitePicker();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <Layers size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.flashcardPage")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.flashcardHint")}</small></span>
            </button>
          </div>
          <AddMenuDivider />
          <div role="group" aria-label={t("panel.addMenu.importAria")} data-menu-group="import-products">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openDocumentImportPicker();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <FileDigit size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.document")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.documentHint")}</small></span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openArtifactImportPicker();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <MonitorPlay size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.artifact")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.artifactHint")}</small></span>
            </button>
          </div>
          <AddMenuDivider />
          <div role="group" aria-label={t("panel.addMenu.createAria")} data-menu-group="create-files">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                createAndOpenNote();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <NotebookFormulaIcon size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.newNote")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.newNoteHint")}</small></span>
            </button>
            <button type="button" role="menuitem" onClick={() => void pickLocalFiles()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--bg-muted)]">
              <Upload size={14} className="text-[var(--md-sys-color-primary)]" />
              <span><strong className="font-semibold">{t("panel.addMenu.addFile")}</strong><small className="ml-1 text-[var(--ink-soft)]">{t("panel.addMenu.addFileHint")}</small></span>
            </button>
          </div>
          {showUrlField && (
            <>
              <AddMenuDivider />
              <OpenUrlField onOpened={() => setOpen(false)} />
            </>
          )}
          <p className="px-1 pt-1.5 text-[10px] leading-relaxed text-[var(--ink-faint)]">{t("panel.addMenu.footer")}</p>
        </div>,
        document.body,
      )}
      {fileError && typeof document !== "undefined" ? <FileErrorDialog message={fileError} onClose={() => setFileError(null)} /> : null}
      {projectRequiredDialog}
    </div>
  );
}

/** 按可用宽度把窗口分成「直接显示」和「收进溢出菜单」两段（与挂载位置无关）。 */
export function partitionTaskbarWindows(windows: ManagedWindow[], width: number) {
  if (windows.length === 0) return { visible: [] as ManagedWindow[], overflow: [] as ManagedWindow[] };
  const maxWidth = Math.max(0, width);
  if (maxWidth < ICON_SLOT) return { visible: [] as ManagedWindow[], overflow: windows };

  const needsOverflow = windows.length * ICON_SLOT > maxWidth;
  const overflowSlot = needsOverflow ? 1 : 0;
  const maxVisible = Math.max(0, Math.floor(maxWidth / ICON_SLOT) - overflowSlot);
  return {
    visible: windows.slice(0, maxVisible),
    overflow: windows.slice(maxVisible),
  };
}

export default function WindowTaskbar({ host }: WindowTaskbarProps) {
  const windows = useWindowManager((state) => state.windows);
  const activeSessionId = useActiveChatSessionId();
  // 右栏标签条按会话隔离（与 RightPanel 同一套判定）；顶栏任务栏是 Studio 的，不筛。
  const dockWindows = useMemo(
    () => (host === "right-panel" ? filterWindowsForSession(windows, activeSessionId) : windows),
    [activeSessionId, host, windows],
  );
  const { minimizeWindow, restoreWindow } = useWindowManager();
  const ref = useRef<HTMLDivElement | null>(null);
  const dockAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const [width, setWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TaskbarTooltip | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { visible, overflow } = useMemo(() => partitionTaskbarWindows(windows, width), [width, windows]);

  const toggle = (id: string) => {
    const win = useWindowManager.getState().windows.find((item) => item.id === id);
    if (!win) return;
    if (win.minimized) restoreWindow(id);
    else minimizeWindow(id);
  };

  const showTooltip = (win: ManagedWindow, node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    setTooltip({
      win,
      right: Math.max(8, window.innerWidth - rect.right),
      top: rect.bottom + 6,
    });
  };

  const activeTooltip = tooltip && windows.some((win) => win.id === tooltip.win.id) ? tooltip : null;

  if (host === "right-panel") {
    return (
      <AgentDockTabs
        windows={dockWindows}
        addContent={<AddContentButton buttonFocusRef={dockAddButtonRef} />}
        addContentFocusRef={dockAddButtonRef}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <motion.div
        ref={ref}
        layoutId="window-taskbar"
        className="flex min-w-0 flex-1 flex-row-reverse items-center gap-1 overflow-visible"
        transition={{ type: "spring", stiffness: 480, damping: 38 }}
      >
        {overflow.length > 0 && <OverflowMenu windows={overflow} onToggle={toggle} />}
        {visible.map((win) => (
          <button
            key={win.id}
            type="button"
            onClick={() => toggle(win.id)}
            onPointerEnter={(event) => showTooltip(win, event.currentTarget)}
            onPointerLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(win, event.currentTarget)}
            onBlur={() => setTooltip(null)}
            aria-label={win.title}
            className={clsx(
              "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[var(--ink-soft)] shadow-sm transition-colors",
              "border-[color-mix(in_srgb,var(--line)_88%,var(--md-sys-color-primary)_12%)] bg-[var(--bg-elevated)]",
              "hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--bg-muted)]",
              !taskbarAccent(win) && "hover:text-[var(--md-sys-color-primary)]",
              !taskbarAccent(win) && !win.minimized && "text-[var(--md-sys-color-primary)]",
            )}
          >
            <WindowTypeIcon type={win.type} icon={win.icon} data={win.data} size={15} />
            <span
              className={clsx(
                "absolute bottom-0.5 left-1/2 h-0.5 -translate-x-1/2 rounded-full transition-all",
                win.minimized ? "w-4" : "w-2",
                !taskbarAccent(win) && (win.minimized ? "bg-[var(--md-sys-color-primary)]" : "bg-[var(--ink-faint)]"),
              )}
              style={taskbarAccent(win) ? { background: taskbarAccent(win) } : undefined}
            />
            {win.badge && win.badge > 1 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--md-sys-color-primary)] px-1 text-[10px] font-semibold leading-none text-[var(--md-sys-color-on-primary)]">
                {win.badge}
              </span>
            )}
          </button>
        ))}
      </motion.div>
      <AddContentButton />
      {activeTooltip && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{ position: "fixed", right: activeTooltip.right, top: activeTooltip.top }}
          className="pointer-events-none z-[11000] w-max max-w-[min(70vw,28rem)] truncate whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--bg-panel)] px-2 py-1 text-[12px] text-[var(--ink)] opacity-100 shadow-lg"
        >
          {activeTooltip.win.title}
        </div>,
        document.body,
      )}
    </div>
  );
}
