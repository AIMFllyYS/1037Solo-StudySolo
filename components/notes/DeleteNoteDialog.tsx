"use client";

import ConfirmDialog from "@/components/shared/ConfirmDialog";
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
  return <ConfirmDialog ariaLabel={t("window.note.editor.deleteDialogAria")} title={t("window.note.common.deleteConfirmTitle", { title })} body={t("window.note.editor.deleteDialogBody")} eyebrow={t("window.note.common.deleteConfirmEyebrow")} cancelLabel={t("common.cancel")} confirmLabel={t("window.common.delete")} onCancel={onCancel} onConfirm={onConfirm} />;
}
