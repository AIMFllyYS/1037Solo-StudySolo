import { useState } from "react";
import { Trash2, RefreshCw, ChevronLeft, ChevronRight, Download, Quote, MoreHorizontal } from "lucide-react";

import AnchoredMenu from "@/components/ui/AnchoredMenu";

import type { ReviewCard } from "@/lib/review/types";

import { downloadFlashcardMarkdown, downloadFlashcardsCsv, downloadFlashcardsAnki } from "@/lib/review/exportCards";
import { useT } from "@/lib/i18n";
import { BOX } from "./appearance";
export function PreviewMoreMenu({
  card,
  cited,
  onCite,
  onRetry,
  onDiscard,
}: {
  card: ReviewCard;
  cited: boolean;
  onCite: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <AnchoredMenu
      label="更多"
      placement="top"
      width={240}
      role="menu"
      testId="record-preview-more"
      triggerData={{ "data-no-drag": "" }}
      className="press"
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "7px 12px",
        borderRadius: BOX.radius,
        border: BOX.border,
        background: "transparent",
        color: "var(--ink-soft)",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
      trigger={<><MoreHorizontal size={14} /> 更多</>}
    >
      {(close) => (
        <PreviewMoreMenuBody
          card={card}
          cited={cited}
          onCite={onCite}
          onRetry={onRetry}
          onDiscard={onDiscard}
          close={close}
        />
      )}
    </AnchoredMenu>
  );
}

/** 一级：导出 / 分享 / 重做 / 删除；二级：下载 Markdown、下载 CSV。 */
export function PreviewMoreMenuBody({
  card,
  cited,
  onCite,
  onRetry,
  onDiscard,
  close,
}: {
  card: ReviewCard;
  cited: boolean;
  onCite: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  close: () => void;
}) {
  const [pane, setPane] = useState<"root" | "export">("root");
  const t = useT();

  if (pane === "export") {
    return (
      <>
        <button type="button" role="menuitem" className="app-menu-item" onClick={() => setPane("root")}>
          <span className="app-menu-check"><ChevronLeft size={13} /></span>
          <span>返回</span>
        </button>
        <div className="app-menu-heading">导出</div>
        <button
          type="button"
          role="menuitem"
          className="app-menu-item"
          data-testid="record-preview-download-md"
          onClick={() => { downloadFlashcardMarkdown(card); close(); }}
        >
          <span className="app-menu-check"><Download size={13} /></span>
          <span>下载 Markdown<small>这张卡的 .md 文件</small></span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="app-menu-item"
          data-testid="record-preview-download-csv"
          onClick={() => { downloadFlashcardsCsv([card], card.sourceLabel || "复习闪卡"); close(); }}
        >
          <span className="app-menu-check"><Download size={13} /></span>
          <span>下载 CSV<small>表格，可导入其他复习软件</small></span>
        </button>
        <button type="button" role="menuitem" className="app-menu-item" data-testid="record-preview-download-anki" disabled={card.status !== "ready"} onClick={() => { void downloadFlashcardsAnki([card]); close(); }}>
          <span className="app-menu-check"><Download size={13} /></span><span>{t("trace.tool.learningConnectors.download")}<small>{t("trace.tool.learningConnectors.exportHint")}</small></span>
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="record-preview-export"
        onClick={() => setPane("export")}
      >
        <span className="app-menu-check"><Download size={13} /></span>
        <span>导出<small>Markdown / CSV</small></span>
        <ChevronRight size={13} />
      </button>
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="record-preview-share"
        onClick={() => { onCite(); close(); }}
      >
        <span className="app-menu-check"><Quote size={13} /></span>
        <span>{cited ? "已分享" : "分享"}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="record-preview-retry"
        onClick={() => { onRetry(); close(); }}
      >
        <span className="app-menu-check"><RefreshCw size={13} /></span>
        <span>重做</span>
      </button>
      <div className="app-menu-separator" />
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        data-testid="record-preview-delete"
        style={{ color: "var(--md-sys-color-error)" }}
        onClick={() => { onDiscard(); close(); }}
      >
        <span className="app-menu-check"><Trash2 size={13} /></span>
        <span>删除</span>
      </button>
    </>
  );
}