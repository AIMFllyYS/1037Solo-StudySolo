"use client";

import { useCallback, useEffect } from "react";
import { FileText, FileDigit, LoaderCircle } from "lucide-react";
import { useDocuments, getDocumentMarkdown, acquireDocumentBodyLease, hydrateDocumentBody, loadDocumentFull } from "@/lib/hooks/useDocuments";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { assembleDocumentMarkdown } from "@/lib/documents/types";
import { MessageContent } from "@/components/chat/MessageContent";
import { downloadAsMarkdown } from "@/lib/documents/export";
import { useT } from "@/lib/i18n";
import ManagedWindow from "@/components/window/ManagedWindow";

function documentWindowId(id: string) {
  return `document-viewer:${id}`;
}

export default function DocumentViewerLayer() {
  const viewerId = useDocuments((s) => s.viewerId);
  const byId = useDocuments((s) => s.byId);
  const windowTitle = useWindowManager((s) =>
    viewerId ? s.windows.find((win) => win.id === documentWindowId(viewerId))?.title : undefined,
  );
  const t = useT();

  useEffect(() => {
    if (!viewerId) return;
    const release = acquireDocumentBodyLease(viewerId);
    void hydrateDocumentBody(viewerId);
    return release;
  }, [viewerId]);

  if (!viewerId) return null;

  // 文档还没落盘（正在分节撰写 / 生成失败 / 数据被清掉）：窗口照开，画一张说明卡。
  if (!byId[viewerId]) {
    return (
      <ManagedWindow
        windowId={documentWindowId(viewerId)}
        title={windowTitle || t("window.document.viewDocument")}
        icon={<FileText size={15} />}
        onClose={() => useDocuments.getState().closeViewer()}
        fullscreenTarget="notes"
        overlayId={`document-viewer-${viewerId}`}
        bodyClassName="flex flex-col bg-[var(--bg-panel)]"
        unmountWhenMinimized
      >
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
          <LoaderCircle size={22} className="animate-spin motion-reduce:animate-none text-[var(--ink-faint)]" />
          <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
            {t("window.document.notReady")}
          </p>
        </div>
      </ManagedWindow>
    );
  }
  return <DocumentViewerSingle documentId={viewerId} />;
}

function DocumentViewerSingle({ documentId }: { documentId: string }) {
  const doc = useDocuments((s) => s.byId[documentId]);
  const closeViewer = useDocuments((s) => s.closeViewer);
  const handleClose = useCallback(() => closeViewer(), [closeViewer]);
  const t = useT();

  if (!doc) return null;

  const winId = documentWindowId(documentId);
  const markdown = getDocumentMarkdown(documentId) || assembleDocumentMarkdown(doc);
  const progress = `${doc.sections.filter((s) => s.status === "done").length} / ${doc.sections.length}`;

  const actions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-no-drag
        onClick={() => void loadDocumentFull(documentId).then((full) => {
          if (full) downloadAsMarkdown(assembleDocumentMarkdown(full), full.spec.title);
        }).catch(() => {})}
        title={t("window.common.downloadMarkdown")}
        className="press flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]"
      >
        <FileText size={15} />
      </button>
    </div>
  );

  return (
    <ManagedWindow
      windowId={winId}
      title={`${doc.spec.title} · ${progress}`}
      icon={<FileDigit size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={{ minW: 420, minH: 360 }}
      overlayId={`document-viewer-${documentId}`}
      actions={actions}
      bodyClassName="flex flex-col"
      unmountWhenMinimized
    >
      <div className="min-h-0 flex-1 overflow-auto p-4 chat-prose">
        <MessageContent content={markdown} enableVisualizations={false} preserveLineBreaks={false} />
      </div>
    </ManagedWindow>
  );
}
