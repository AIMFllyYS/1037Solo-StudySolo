"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { deleteCloudFile } from '@/lib/files/client';
import { restoreProjectCloudFiles } from '@/lib/project/cloudFiles';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
import { FilePlus2, Link2, RefreshCw, Trash2 } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import DocumentWorkspace, { type DocumentOutlineItem } from "@/components/window/DocumentWorkspace";
import FolderTreeRow from "@/components/layout/FolderTreeRow";
import FileTypeIcon, { resolveFileGlyphKind } from "@/components/icons/file-types/FileTypeIcon";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { useProjectFiles, listProjectFiles } from "@/lib/stores/projectFiles";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { localPathOf } from "@/lib/stores/imports";
import { importProjectFile } from "@/lib/project/import";
import { planCarry } from "@/lib/project/catalog";
import { searchStudioRefs } from "@/lib/project/studioRefs";
import type { ProjectFileEntry } from "@/lib/project/types";
import { projectFilesWindowId } from "@/lib/project/openProjectFiles";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useT, type Translate } from "@/lib/i18n";

/** 工具条按钮：四个按钮共用一份样式，避免各写各的以后漂移。 */
const TOOLBAR_BUTTON =
  "flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2 py-1 text-[12px] text-[var(--ink)] hover:border-[var(--accent)]";
const TOOLBAR_DANGER_BUTTON =
  "flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2 py-1 text-[12px] text-[var(--md-sys-color-error)] hover:border-[var(--md-sys-color-error)]";

function statusLabel(file: ProjectFileEntry, t: Translate): string {
  if (file.status === "parsing") return t("window.project.statusParsing");
  if (file.status === "error") return t("window.project.statusError", { reason: file.error ?? t("window.project.unknownReason") });
  if (file.kind === "studio-ref") return t("window.project.kindStudioRef");
  return t("window.project.sliceStats", { slices: file.slices.length, chars: file.charCount });
}

/**
 * 项目文件窗（Agent 右栏）。左边是文件树（文件 → .index.md → 切片），右边是索引或切片正文。
 *
 * 原文件与处理上下文保存在私有云端；本窗管理本机索引缓存与切片选择，Agent 可按需读取云端全文。
 */
export default function ProjectFilesWindow({ projectId }: { projectId: string }) {
  const windowId = projectFilesWindowId(projectId);
  const orders = useProjectFiles((s) => s.order);
  const byId = useProjectFiles((s) => s.byId);
  const setPinned = useProjectFiles((s) => s.setPinned);
  const removeFile = useProjectFiles((s) => s.removeFile);
  const addStudioRef = useProjectFiles((s) => s.addStudioRef);
  const projectName = useChatHistory((s) => s.folders.find((folder) => folder.id === projectId)?.name ?? null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectFileEntry | null>(null);
  const [fileError, setFileError] = useState('');
  useEffect(() => { void restoreProjectCloudFiles(projectId).catch(error => setFileError(error.message)); }, [projectId]);
  const [studioQuery, setStudioQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const t = useT();

  const files = useMemo(() => listProjectFiles({ order: orders, byId }, projectId), [byId, orders, projectId]);
  const carry = useMemo(() => planCarry(files, projectId), [files, projectId]);
  const activeFile = files.find((file) => activeKey?.startsWith(`${file.id}:`)) ?? files[0] ?? null;
  const activeSliceId = activeKey && activeFile && activeKey !== `${activeFile.id}:index`
    ? activeKey.slice(activeFile.id.length + 1)
    : null;

  const outline: DocumentOutlineItem[] = activeFile
    ? [
        {
          id: `${activeFile.id}:index`,
          title: ".index.md",
          kindLabel: t("window.project.kindIndex"),
          // 这里以前放的是文件名，10px 等宽字截断成一条看不清的「面包屑」。
          // 文件名已经由下方文件树承担；普通文件给索引规模，教材引用给出处地址（它没有切片/字数可言）。
          meta: activeFile.studioRef?.address ?? t("window.project.sliceStats", { slices: activeFile.slices.length, chars: activeFile.charCount }),
        },
        ...activeFile.slices.map((slice) => ({
          id: `${activeFile.id}:${slice.id}`,
          title: slice.title,
          kindLabel: slice.pinned ? t("window.project.kindPinned") : undefined,
          meta: t("window.project.charCount", { count: slice.chars }),
        })),
      ]
    : [];

  const currentId = activeFile
    ? activeSliceId
      ? `${activeFile.id}:${activeSliceId}`
      : `${activeFile.id}:index`
    : "";

  const handleFiles = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    if (picked.length > 9) { setFileError('单次最多导入 9 个文件，完成后可继续导入。'); return; }
    for (const file of picked) {
      setBusy(file.name);
      const result = await importProjectFile({ projectId, file, absPath: localPathOf(file) });
      if (result.error) setFileError(result.error);
    }
    setBusy(null);
  };

  const results = useMemo(() => searchStudioRefs(studioQuery), [studioQuery]);

  const carryText =
    carry.mode === "all"
      ? t("window.project.carryAll", { slices: carry.totalSlices, chars: carry.totalChars })
      : carry.mode === "pinned"
        ? t("window.project.carryPinned", { pinned: carry.sliceIds.length, total: carry.totalSlices })
        : carry.totalSlices > 0
          ? t("window.project.carryTooLarge", { total: carry.totalSlices })
          : t("window.project.carryNone");

  const toolbar = (
    // 工具条高度固定 32px：状态文案自己截断，按钮组 shrink-0 且不换行，
    // 否则窗口一窄按钮就被换行挤出可视区（以前是 flex-wrap，会直接溢出这条 32px）。
    <div className="flex min-w-0 flex-1 items-center gap-2" data-no-drag>
      <span
        className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-faint)]"
        title={carryText}
        data-testid="project-carry-status"
      >
        {carryText}
      </span>
      <div className="flex shrink-0 items-center gap-2">
      <button type="button" data-no-drag className={TOOLBAR_BUTTON} onClick={() => fileInputRef.current?.click()}>
        <FilePlus2 size={13} /> {t("window.project.addFile")}
      </button>
      <AnchoredMenu
        label={t("window.project.citeStudioLabel")}
        trigger={<><Link2 size={13} /> {t("window.project.citeTextbook")}</>}
        width={280}
        className={TOOLBAR_BUTTON}
      >
        {(close) => (
          <>
            <input
              autoFocus
              value={studioQuery}
              aria-label={t("window.project.studioSearchAria")}
              data-testid="project-studio-search"
              placeholder={t("window.project.studioSearchPlaceholder")}
              onChange={(event) => setStudioQuery(event.target.value)}
              className="mx-1.5 my-1 w-[calc(100%-0.75rem)] rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none"
            />
            {results.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[11.5px] text-[var(--ink-faint)]">
                {studioQuery.trim() ? t("window.project.studioNoMatch") : t("window.project.studioHint")}
              </p>
            ) : (
              results.map((ref) => (
                <button
                  key={ref.path}
                  type="button"
                  role="menuitem"
                  data-testid={`project-studio-ref-${ref.path}`}
                  className="app-menu-item"
                  onClick={() => {
                    addStudioRef({ projectId, ref });
                    setStudioQuery("");
                    close();
                  }}
                >
                  <span className="app-menu-check"><Link2 size={13} /></span>
                  <span>{ref.title}<small>{ref.address}</small></span>
                </button>
              ))
            )}
          </>
        )}
      </AnchoredMenu>
      {activeFile ? (
        <>
          {/* 教材引用是软链接不是本地文件，没有「重新导入」可讲。 */}
          {activeFile.kind !== "studio-ref" ? (
            <button type="button" data-no-drag className={TOOLBAR_BUTTON} onClick={() => fileInputRef.current?.click()} title={t("window.project.reimportTitle")}>
              <RefreshCw size={13} /> {t("window.project.reimport")}
            </button>
          ) : null}
          <button type="button" data-no-drag className={TOOLBAR_DANGER_BUTTON} onClick={() => setPendingDelete(activeFile)}>
            <Trash2 size={13} /> {t("window.project.remove")}
          </button>
        </>
      ) : null}
      </div>
    </div>
  );

  const folderTree = (
    // 带文件夹树时 .note-citation-sidebar 的 padding 被置 0，这里自己补左右内边距，
    // 否则文件行会贴死在目录列的左/右边线上。
    <div className="flex flex-col gap-0.5 px-1.5 py-1" data-testid="project-file-tree">
      {files.length === 0 ? (
        <p className="px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
          {t("window.project.emptyFiles")}
          <br />{t("window.project.emptyFilesNote")}
        </p>
      ) : (
        files.map((file) => (
          <FolderTreeRow
            key={file.id}
            depth={0}
            title={file.name}
            isSelected={file.id === activeFile?.id}
            icon={
              file.kind === "studio-ref"
                ? <Link2 size={14} />
                : <FileTypeIcon kind={resolveFileGlyphKind({ mimeType: file.mimeType, name: file.name })} mimeType={file.mimeType} name={file.name} size={15} />
            }
            titleAttr={statusLabel(file, t)}
            ariaLabel={file.name}
            onClick={() => setActiveKey(`${file.id}:index`)}
          />
        ))
      )}
    </div>
  );

  const body = !activeFile ? (
    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-[var(--ink-soft)]">
      {t("window.project.emptyProject")}
    </div>
  ) : activeSliceId ? (
    (() => {
      const slice = activeFile.slices.find((item) => item.id === activeSliceId);
      if (!slice) return null;
      return (
        <div className="flex h-full flex-col gap-2 p-3">
          {/* 标题可截断、字数与按钮不参与压缩：窗口窄的时候挤坏的应该是标题，不是按钮。 */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-[var(--ink)]" title={slice.title}>
              {slice.title}
            </span>
            <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">{t("window.project.charCount", { count: slice.chars })}</span>
            <button
              type="button"
              data-testid="project-slice-pin"
              className={`ml-auto shrink-0 rounded-lg border px-2 py-1 text-[11.5px] ${slice.pinned ? "border-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line-soft)] text-[var(--ink-soft)]"}`}
              onClick={() => setPinned(activeFile.id, slice.id, !slice.pinned)}
              title={carry.mode === "all" ? t("window.project.pinAllTitle") : t("window.project.pinTitle")}
            >
              {slice.pinned ? t("window.project.pinned") : t("window.project.pin")}
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3 text-[12.5px] leading-relaxed text-[var(--ink)]">
            {slice.text}
          </pre>
        </div>
      );
    })()
  ) : (
    // 目录里「.index.md / 索引」一项已经说明了这是什么，正文不再重复贴一行标题——
    // 那行字贴在 body 最左上、压着边线，正是用户嫌「怪异」的来源。
    <div className="flex h-full flex-col gap-2 p-3">
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3 text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {activeFile.indexMarkdown || t("window.project.indexEmpty")}
      </pre>
    </div>
  );

  return (
    <ManagedWindow
      windowId={windowId}
      title={t("window.project.windowTitle", { name: projectName ?? t("window.project.untitledProject") })}
      icon={<FilePlus2 size={15} />}
      onClose={() => useWindowManager.getState().closeWindow(windowId)}
      fullscreenTarget="notes"
      minSize={{ minW: 520, minH: 360 }}
      overlayId="project-files"
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="project-file-input"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {fileError ? <p role="alert" className="px-3 text-xs text-[var(--md-sys-color-error)]">{fileError}</p> : null}
      {pendingDelete ? <ConfirmDialog title="确认移除项目文件？" body={`「${pendingDelete.name}」将从项目移除；云端文件执行基础软删除，原文件暂时保留。`} cancelLabel="取消" confirmLabel="确认移除" onCancel={() => setPendingDelete(null)} onConfirm={() => { const file = pendingDelete, epoch = getOwnerEpoch(); void (async () => { try { if (file.cloudFileId) await deleteCloudFile(file.cloudFileId); if (getOwnerEpoch() !== epoch) return; removeFile(file.id); setPendingDelete(null); } catch (error) { if (getOwnerEpoch() === epoch) setFileError(error instanceof Error ? error.message : '文件移除失败。'); } })(); }} /> : null}
      <DocumentWorkspace
        layoutKey="project-files"
        outlineLabel={activeFile ? activeFile.name : t("window.project.sliceOutlineFallback")}
        outline={outline}
        activeId={currentId}
        onSelect={setActiveKey}
        toolbar={toolbar}
        folderTree={folderTree}
        emptyLabel={t("window.project.emptySlices")}
      >
        {busy ? (
          <div role="status" className="flex h-full items-center justify-center text-[12.5px] text-[var(--ink-soft)]">
            {t("window.project.parsing", { name: busy })}
          </div>
        ) : (
          body
        )}
      </DocumentWorkspace>
    </ManagedWindow>
  );
}
