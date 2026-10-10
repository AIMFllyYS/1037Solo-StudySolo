import { type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { prepareFeedbackText } from "@/lib/chat/feedback/feedbackExcerpt";

import { useT } from "@/lib/i18n";

import type { RefObject } from "react";
import { REPORT_REASONS, reportReasonValue, type ReportReason, type DialogState } from "./model";
type FeedbackDialogProps = {
  dialog: DialogState; dialogId: string;
  dialogRootRef: RefObject<HTMLDivElement | null>;
  voteExcerptRef: RefObject<HTMLInputElement | null>;
  reportReasonRef: RefObject<HTMLSelectElement | null>;
  staleCloseRef: RefObject<HTMLButtonElement | null>;
  busyRef: RefObject<boolean>;
  busy: boolean; reportReason: ReportReason | ""; feedbackText: string;
  includeExcerpt: boolean; error: string; excerptPreview: string;
  setReportReason: (value: ReportReason | "") => void;
  setFeedbackText: (value: string) => void;
  setIncludeExcerpt: (value: boolean) => void;
  closeDialog: () => void; clearStaleDialog: () => void;
  submitVoteDetails: () => Promise<void>;
  submitReport: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};
export default function FeedbackDialog({ dialog, dialogId, dialogRootRef, voteExcerptRef, reportReasonRef, staleCloseRef, busyRef, busy, reportReason, feedbackText, includeExcerpt, error, excerptPreview, setReportReason, setFeedbackText, setIncludeExcerpt, closeDialog, clearStaleDialog, submitVoteDetails, submitReport }: FeedbackDialogProps) {
const t = useT();
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const dialogRoot = event.currentTarget;
    const controls = Array.from(dialogRoot.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const reasonLabels: Record<ReportReason, string> = {
    inaccurate: t("panel.chatFeedback.inaccurate"),
    unsafe: t("panel.chatFeedback.unsafe"),
    privacy: t("panel.chatFeedback.privacy"),
    other: t("panel.chatFeedback.other"),
  };

return createPortal(
        <div className="app-dialog-backdrop" data-testid="chat-feedback-backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget && !busyRef.current) closeDialog();
        }}>
          <div
            ref={dialogRootRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            data-testid="chat-feedback-dialog"
            className="app-dialog w-[min(480px,calc(100vw-2rem))]"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id={`${dialogId}-title`} className="text-[16px] font-semibold text-[var(--ink)]">
              {dialog.kind === "report" ? t("panel.chatFeedback.reportTitle") : t("panel.chatFeedback.voteDetailsTitle")}
            </h2>
            <div className="mt-3">
            {dialog.kind === "vote" ? (
              <>
                <p className="text-[13px] leading-relaxed text-[var(--ink)]">{t("panel.chatFeedback.voteSaved")}</p>
                {dialog.stale ? (
                  <p role="alert" className="mt-3 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-[12px] text-[var(--md-sys-color-error)]">{error || t("panel.chatFeedback.stale")}</p>
                ) : excerptPreview ? (
                  <div className="mt-3 grid gap-3">
                    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[var(--ink-soft)]">
                      {t("panel.chatFeedback.feedbackText")}
                      <textarea data-testid="chat-feedback-textarea" value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} maxLength={1_000} rows={3} className="min-h-20 resize-y rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-2 text-[13px] text-[var(--ink)]" />
                      <span className="font-normal leading-relaxed">{t("panel.chatFeedback.feedbackTextPrivacy")}</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 text-[12.5px] text-[var(--ink)]">
                      <input ref={voteExcerptRef} type="checkbox" checked={includeExcerpt} onChange={(event) => setIncludeExcerpt(event.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t("panel.chatFeedback.excerptLabel")}</span>
                        <span className="mt-1 block leading-relaxed text-[var(--ink-soft)]">{t("panel.chatFeedback.excerptPrivacy")}</span>
                        <span className="mt-2 block max-h-24 overflow-y-auto rounded-md bg-[var(--bg-panel)] p-2 text-[11.5px] leading-relaxed">{excerptPreview}</span>
                      </span>
                    </label>
                  </div>
                ) : null}
                {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--md-sys-color-error)]">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  {dialog.stale ? (
                    <button ref={staleCloseRef} type="button" onClick={clearStaleDialog} className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)]">{t("panel.chatFeedback.staleClose")}</button>
                  ) : (
                    <>
                      <button type="button" onClick={closeDialog} className="press rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]">{t("panel.chatFeedback.cancel")}</button>
                      {feedbackText.trim() || includeExcerpt ? <button type="button" disabled={busy} onClick={() => void submitVoteDetails()} className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-55">{busy ? t("panel.chatFeedback.submitting") : t("panel.chatFeedback.submitExcerpt")}</button> : null}
                    </>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void submitReport(event)}>
                <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">{t("panel.chatFeedback.reportHint")}</p>
                <label className="mt-4 flex flex-col gap-1.5 text-[12px] font-medium text-[var(--ink-soft)]">
                  {t("panel.chatFeedback.reason")}
                  <select
                    ref={reportReasonRef}
                    value={reportReason}
                    onChange={(event) => setReportReason(reportReasonValue(event.target.value))}
                    className="min-h-9 rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 text-[13px] text-[var(--ink)]"
                  >
                    <option value="">{t("panel.chatFeedback.reason")}</option>
                    {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{reasonLabels[reason]}</option>)}
                  </select>
                </label>
                <label className="mt-3 flex flex-col gap-1.5 text-[12px] font-medium text-[var(--ink-soft)]">
                  {t("panel.chatFeedback.feedbackText")}
                  <textarea data-testid="chat-feedback-textarea" value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} maxLength={1_000} minLength={3} required rows={3} className="min-h-20 resize-y rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-2 text-[13px] text-[var(--ink)]" />
                  <span className="font-normal leading-relaxed">{t("panel.chatFeedback.feedbackTextPrivacy")}</span>
                </label>
                {excerptPreview ? (
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-3 text-[12.5px] text-[var(--ink)]">
                    <input type="checkbox" checked={includeExcerpt} onChange={(event) => setIncludeExcerpt(event.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t("panel.chatFeedback.excerptLabel")}</span>
                      <span className="mt-1 block leading-relaxed text-[var(--ink-soft)]">{t("panel.chatFeedback.excerptPrivacy")}</span>
                      <span className="mt-2 block max-h-24 overflow-y-auto rounded-md bg-[var(--bg-panel)] p-2 text-[11.5px] leading-relaxed">{excerptPreview}</span>
                    </span>
                  </label>
                ) : null}
                {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--md-sys-color-error)]">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={closeDialog} className="press rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]">{t("panel.chatFeedback.cancel")}</button>
                  <button type="submit" disabled={busy || !reportReason || Array.from(prepareFeedbackText(feedbackText)).length < 3} className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-55">{busy ? t("panel.chatFeedback.submitting") : t("panel.chatFeedback.submitReport")}</button>
                </div>
              </form>
            )}
            </div>
          </div>
        </div>,
        document.body,
       );
}
