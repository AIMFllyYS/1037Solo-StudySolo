"use client";

import { BookOpen, FileDigit, FolderTree, Layers, MonitorPlay, PenLine } from "lucide-react";
import { openTextbookWindow } from "@/lib/textbook/openTextbook";
import { useProjectFilesEntry } from "@/components/project/useProjectFilesEntry";
import {
  createAndOpenNote,
  openArtifactImportPicker,
  openDocumentImportPicker,
  openFlashcardCitePicker,
  openNoteLibrary,
} from "@/lib/notes/openUserNote";
import { useT } from "@/lib/i18n";

interface Entry {
  id: string;
  /** 文案 key：与右栏「＋」菜单共用同一批词条。 */
  labelKey: string;
  hintKey: string;
  icon: React.ReactNode;
  run: () => void;
}

/** 空态引导项与右栏「＋」菜单同一批入口，不新增业务路径。 */
const ENTRIES: Entry[] = [
  { id: "new-note", labelKey: "panel.addMenu.newNote", hintKey: "panel.addMenu.newNoteHint", icon: <PenLine size={15} />, run: () => createAndOpenNote() },
  { id: "pick-note", labelKey: "panel.addMenu.pickNote", hintKey: "panel.addMenu.pickNoteHint", icon: <BookOpen size={15} />, run: () => openNoteLibrary({ intent: "cite" }) },
  { id: "flashcards", labelKey: "panel.dockEmpty.flashcard", hintKey: "panel.addMenu.flashcardHint", icon: <Layers size={15} />, run: () => openFlashcardCitePicker() },
  { id: "import-doc", labelKey: "panel.addMenu.document", hintKey: "panel.addMenu.documentHint", icon: <FileDigit size={15} />, run: () => openDocumentImportPicker() },
  { id: "import-html", labelKey: "panel.addMenu.artifact", hintKey: "panel.addMenu.artifactHint", icon: <MonitorPlay size={15} />, run: () => openArtifactImportPicker() },
];

/**
 * 右栏空白时的引导（对齐 Codex 空面板的「给你几个可以直接点的入口」）。
 * 只负责把已有入口摆出来，点击后走各自原有业务路径。
 */
export default function AgentDockEmptyState({ hasHiddenWindows = false }: { hasHiddenWindows?: boolean }) {
  const t = useT();
  const { openProjectFilesEntry, projectRequiredDialog } = useProjectFilesEntry();
  const entries: Entry[] = [
    { id: "textbook", labelKey: "panel.addMenu.textbook", hintKey: "panel.addMenu.textbookHint", icon: <BookOpen size={15} />, run: () => { openTextbookWindow(); } },
    { id: "project-files", labelKey: "panel.addMenu.projectFiles", hintKey: "panel.addMenu.projectFilesHint", icon: <FolderTree size={15} />, run: openProjectFilesEntry },
    ...ENTRIES,
  ];
  return (
    <div
      data-testid="agent-dock-empty"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="text-[13px] font-semibold text-[var(--ink)]">
        {t(hasHiddenWindows ? "panel.dockEmpty.hiddenTitle" : "panel.dockEmpty.emptyTitle")}
      </p>
      <p className="max-w-[20rem] text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {t(hasHiddenWindows ? "panel.dockEmpty.hiddenHint" : "panel.dockEmpty.emptyHint")}
      </p>
      <div className="mt-1 flex w-full max-w-[20rem] flex-col gap-1">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-testid={`agent-dock-empty-${entry.id}`}
            onClick={entry.run}
            className="press flex w-full items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-left transition-colors hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--bg-muted)]"
          >
            <span className="shrink-0 text-[var(--md-sys-color-primary)]">{entry.icon}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">{t(entry.labelKey)}</span>
            <span className="shrink-0 truncate text-[11px] text-[var(--ink-faint)]">{t(entry.hintKey)}</span>
          </button>
        ))}
      </div>
      {projectRequiredDialog}
    </div>
  );
}
