"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { deleteCloudFile } from '@/lib/files/client';
import { restoreProjectCloudFiles } from '@/lib/project/cloudFiles';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
import { AlertCircle, FilePlus2, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import DocumentWorkspace, { type DocumentOutlineItem } from "@/components/window/DocumentWorkspace";
import FolderTreeRow from "@/components/layout/navigation/FolderTreeRow";
import FileTypeIcon, { resolveFileGlyphKind } from "@/components/icons/file-types/FileTypeIcon";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import ActionButton, { actionClass } from "@/components/ui/ActionButton";
import Badge from "@/components/ui/Badge";
import { EmptyState, InlineNotice } from "@/components/ui/PageChrome";
import { formatAssetSize } from "@/lib/agent/assetCatalog";
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

function statusLabel(file: ProjectFileEntry, t: Translate): string {
  if (file.status === "parsing") return t("window.project.statusParsing");
  if (file.status === "error") return t("window.project.statusError", { reason: file.error ?? t("window.project.unknownReason") });
  if (file.kind === "studio-ref") return t("window.project.kindStudioRef");
  return t("window.project.sliceStats", { slices: file.slices.length, chars: file.charCount });
}

/** 文件树行尾的状态位：解析中转圈、失败标红、正常给切片数；教材软链接不报数。 */
function FileRowStatus({ file, t }: { file: ProjectFileEntry; t: Translate }) {
  if (file.status === "parsing") {
    return <Badge tone="accent" icon={<Loader2 size={10} className="animate-spin" />}>{t("window.project.statusParsing")}</Badge>;
  }
  if (file.status === "error") return <Badge tone="danger" icon={<AlertCircle size={10} />}>{t("window.common.failed")}</Badge>;
  if (file.kind === "studio-ref") return <Badge tone="outline" icon={<Link2 size={10} />}>{t("window.project.kindStudioRef")}</Badge>;
  return <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--ink-faint)]">{file.slices.length}</span>;
}

/** 文件概览：一排数据块（切片 / 字数 / 大小 / 保存位置），比一整页等宽字更先回答「这个文件解析成什么样了」。 */
function FileOverview({ file, t }: { file: ProjectFileEntry; t: Translate }) {
  const isRef = file.kind === "studio-ref";
  const stats: { label: string; value: string }[] = [
    { label: t("window.project.statSlices"), value: String(file.slices.length) },
    { label: t("window.project.statChars"), value: file.charCount.toLocaleString() },
    { label: t("window.project.statSize"), value: formatAssetSize(file.sizeBytes) ?? "—" },
    { label: t("window.project.statSaved"), value: isRef ? t("window.project.savedRef") : file.cloudFileId ? t("window.project.savedCloud") : t("window.project.savedLocal") },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
          {isRef ? <Link2 size={18} /> : <FileTypeIcon kind={resolveFileGlyphKind({ mimeType: file.mimeType, name: file.name })} mimeType={file.mimeType} name={file.name} size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13.5px] font-semibold text-[var(--ink)]" title={file.name}>{file.name}</h2>
          <p className="truncate text-[11.5px] text-[var(--ink-faint)]" title={file.studioRef?.address ?? file.absPath ?? file.mimeType}>{file.studioRef?.address ?? file.absPath ?? file.mimeType ?? "—"}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-xl bg-[var(--bg-muted)] px-2.5 py-1.5">
            <dt className="text-[10.5px] text-[var(--ink-faint)]">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-[12.5px] font-medium tabular-nums text-[var(--ink)]" title={stat.value}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {isRef ? <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)]">{t("window.project.studioRefNote")}</p> : null}
    </div>
  );
}

/** 正在解析的进度条：文件名 + 步骤 + 不定长进度。多文件导入时带「第 i / n 个」。 */
function ParsingCard({ name, index, total, t, compact = false }: { name: string; index?: number; total?: number; t: Translate; compact?: boolean }) {
  return (
    <div role="status" className={compact ? "flex flex-col gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3" : "mx-auto flex w-full max-w-[420px] flex-col gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-5"}>
      <div className="flex min-w-0 items-center gap-2">
        <Loader2 size={15} className="shrink-0 animate-spin text-[var(--accent)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">{t("window.project.parsing", { name })}</span>
        {total && total > 1 ? <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-faint)]">{t("window.project.batchProgress", { index: index ?? 1, total })}</span> : null}
      </div>
      <span className="ss-progress" aria-hidden />
      <p className="text-[11px] text-[var(--ink-faint)]">{t("window.project.parsingSteps")}</p>
    </div>
  );
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
  const [progress, setProgress] = useState<{ name: string; index: number; total: number } | null>(null);
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
    setFileError('');
    for (const [index, file] of picked.entries()) {
      setProgress({ name: file.name, index: index + 1, total: picked.length });
      const result = await importProjectFile({ projectId, file, absPath: localPathOf(file) });
      if (result.error) setFileError(result.error);
    }
    setProgress(null);
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

  const pickFile = () => fileInputRef.current?.click();

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
      <div className="flex shrink-0 items-center gap-1.5">
        <ActionButton size="sm" variant="primary" data-no-drag icon={<FilePlus2 size={13} />} onClick={pickFile}>
          {t("window.project.addFile")}
        </ActionButton>
        <AnchoredMenu
          label={t("window.project.citeStudioLabel")}
          trigger={<><Link2 size={13} /> {t("window.project.citeTextbook")}</>}
          width={280}
          className={actionClass("secondary", "sm")}
          triggerData={{ "data-action-variant": "secondary" }}
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
                className="mx-1.5 my-1 w-[calc(100%-0.75rem)] rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
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
              <ActionButton size="sm" variant="ghost" data-no-drag icon={<RefreshCw size={13} />} onClick={pickFile} title={t("window.project.reimportTitle")}>
                {t("window.project.reimport")}
              </ActionButton>
            ) : null}
            <ActionButton size="sm" variant="danger" data-no-drag icon={<Trash2 size={13} />} onClick={() => setPendingDelete(activeFile)}>
              {t("window.project.remove")}
            </ActionButton>
          </>
        ) : null}
      </div>
    </div>
  );

  const folderTree = (
    // 带文件夹树时 .note-citation-sidebar 的 padding 被置 0，这里自己补左右内边距，
    // 否则文件行会贴死在目录列的左/右边线上。
    <div className="flex flex-col gap-0.5 px-2 py-1.5" data-testid="project-file-tree">
      {files.length === 0 ? (
        <p className="px-2 py-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
          {t("window.project.emptyFiles")}
          <br />{t("window.project.emptyFilesNote")}
        </p>
      ) : (
        files.map((file) => (
          <FolderTreeRow
            key={file.id}
            depth={0}
            inset
            title={file.name}
            isSelected={file.id === activeFile?.id}
            icon={
              file.kind === "studio-ref"
                ? <Link2 size={14} />
                : <FileTypeIcon kind={resolveFileGlyphKind({ mimeType: file.mimeType, name: file.name })} mimeType={file.mimeType} name={file.name} size={15} />
            }
            titleAttr={statusLabel(file, t)}
            ariaLabel={file.name}
            fadeTitle
            endAdornment={<FileRowStatus file={file} t={t} />}
            onClick={() => setActiveKey(`${file.id}:index`)}
          />
        ))
      )}
    </div>
  );

  const body = !activeFile ? (
    <EmptyState
      icon={FilePlus2}
      title={t("window.project.emptyProject")}
      description={t("window.project.emptyFilesNote")}
      action={<ActionButton variant="primary" icon={<FilePlus2 size={14} />} onClick={pickFile}>{t("window.project.addFile")}</ActionButton>}
    />
  ) : activeFile.status === "parsing" ? (
    <div className="flex h-full items-center justify-center p-4"><ParsingCard name={activeFile.name} t={t} /></div>
  ) : activeFile.status === "error" ? (
    <EmptyState
      icon={AlertCircle}
      title={t("window.project.parseFailedTitle")}
      description={<>{t("window.project.statusError", { reason: activeFile.error ?? t("window.project.unknownReason") })}<br />{t("window.project.parseFailedHint")}</>}
      action={activeFile.kind === "studio-ref" ? undefined : <ActionButton variant="secondary" icon={<RefreshCw size={14} />} onClick={pickFile}>{t("window.project.reimport")}</ActionButton>}
    />
  ) : activeSliceId ? (
    (() => {
      const slice = activeFile.slices.find((item) => item.id === activeSliceId);
      if (!slice) return null;
      return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
          {/* 标题可截断、字数与按钮不参与压缩：窗口窄的时候挤坏的应该是标题，不是按钮。 */}
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--ink)]" title={slice.title}>
              {slice.title}
            </h3>
            <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-faint)]">{t("window.project.charCount", { count: slice.chars })}</span>
            <ActionButton
              size="sm"
              variant={slice.pinned ? "primary" : "secondary"}
              data-testid="project-slice-pin"
              aria-pressed={!!slice.pinned}
              className="ml-auto"
              onClick={() => setPinned(activeFile.id, slice.id, !slice.pinned)}
              title={carry.mode === "all" ? t("window.project.pinAllTitle") : t("window.project.pinTitle")}
            >
              {slice.pinned ? t("window.project.pinned") : t("window.project.pin")}
            </ActionButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 text-[13px] leading-[1.75] text-[var(--ink)]">
            {slice.text}
          </div>
        </div>
      );
    })()
  ) : (
    // 目录里「.index.md / 索引」一项已经说明了这是什么，正文不再重复贴一行标题——
    // 那行字贴在 body 最左上、压着边线，正是用户嫌「怪异」的来源。先给概览，再给索引原文。
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <FileOverview file={activeFile} t={t} />
      <section className="flex min-h-0 flex-col gap-1.5">
        <h3 className="px-0.5 text-[11.5px] font-semibold text-[var(--ink-faint)]">{t("window.project.indexHeading")}</h3>
        <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3.5 font-mono text-[11.5px] leading-relaxed text-[var(--ink-soft)]">
          {activeFile.indexMarkdown || t("window.project.indexEmpty")}
        </pre>
      </section>
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
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
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
      {fileError ? (
        <div className="shrink-0 px-3 pt-2">
          <InlineNotice tone="danger" actions={<ActionButton size="sm" variant="ghost" onClick={() => setFileError('')}>{t("window.project.dismiss")}</ActionButton>}>{fileError}</InlineNotice>
        </div>
      ) : null}
      {pendingDelete ? <ConfirmDialog title="确认移除项目文件？" body={`「${pendingDelete.name}」将从项目移除；云端文件执行基础软删除，原文件暂时保留。`} cancelLabel="取消" confirmLabel="确认移除" onCancel={() => setPendingDelete(null)} onConfirm={() => { const file = pendingDelete, epoch = getOwnerEpoch(); void (async () => { try { if (file.cloudFileId) await deleteCloudFile(file.cloudFileId); if (getOwnerEpoch() !== epoch) return; removeFile(file.id); setPendingDelete(null); } catch (error) { if (getOwnerEpoch() === epoch) setFileError(error instanceof Error ? error.message : '文件移除失败。'); } })(); }} /> : null}
      <div className="flex min-h-0 min-w-0 flex-1">
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
          <div className="flex h-full min-h-0 flex-col">
            {progress ? <div className="shrink-0 px-4 pt-3"><ParsingCard compact name={progress.name} index={progress.index} total={progress.total} t={t} /></div> : null}
            <div className="min-h-0 flex-1">{body}</div>
          </div>
        </DocumentWorkspace>
      </div>
    </ManagedWindow>
  );
}
