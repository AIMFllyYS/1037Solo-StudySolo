"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";

/**
 * 删除笔记的二次确认（.app-dialog 外观，与全站删除确认一致）。
 * 笔记编辑窗与 Review 笔记页共用；Esc 取消。
 */
export default function DeleteNoteDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  return createPortal(
    <div className="app-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-label={t("window.note.editor.deleteDialogAria")} className="app-dialog">
        <div className="app-dialog-eyebrow">{t("window.note.common.deleteConfirmEyebrow")}</div>
        <h2>{t("window.note.common.deleteConfirmTitle", { title })}</h2>
        <p>{t("window.note.editor.deleteDialogBody")}</p>
        <div className="user-note-dialog-actions">
          <button type="button" className="user-note-dialog-cancel" onClick={onCancel} autoFocus>
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
