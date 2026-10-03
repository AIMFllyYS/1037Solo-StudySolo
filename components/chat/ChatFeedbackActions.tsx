"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Flag, ThumbsDown, ThumbsUp } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { prepareFeedbackExcerpt, prepareFeedbackText } from "@/lib/chat/feedbackExcerpt";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";

type Vote = "like" | "dislike";
const REPORT_REASONS = ["inaccurate", "unsafe", "privacy", "other"] as const;
type ReportReason = typeof REPORT_REASONS[number];
const reportReasonValue = (value: string): ReportReason | "" => REPORT_REASONS.find((reason) => reason === value) ?? "";
type FeedbackRecord = {
  id: string;
  feedbackType: string;
  revision: number;
  status: string;
  reportReason?: string | null;
  feedbackText?: string | null;
  answerExcerpt?: string | null;
};
type DialogState =
  | { kind: "vote"; vote: Vote; record: FeedbackRecord; stale?: boolean }
  | { kind: "report"; stale?: boolean };

function errorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "SESSION_MISSING":
    case "SESSION_INVALID": return t("panel.chatFeedback.loginRequired");
    case "MFA_REQUIRED": return t("panel.chatFeedback.mfaRequired");
    case "ACCOUNT_UNAVAILABLE": return t("panel.chatFeedback.accountUnavailable");
    case "FEEDBACK_MIGRATION_PENDING": return t("panel.chatFeedback.migrationPending");
    case "RATE_LIMITED": return t("panel.chatFeedback.rateLimited");
    case "FEEDBACK_STALE": return t("panel.chatFeedback.stale");
    default: return t("panel.chatFeedback.submitFailed");
  }
}

async function postFeedback(body: Record<string, unknown>): Promise<FeedbackRecord> {
  const response = await fetch("/api/feedback/chat", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(typeof payload.code === "string" ? payload.code : "FEEDBACK_UNAVAILABLE");
    throw error;
  }
  if (typeof payload.id !== "string" || typeof payload.feedbackType !== "string"
    || !Number.isSafeInteger(payload.revision) || typeof payload.status !== "string") {
    throw new Error("FEEDBACK_UNAVAILABLE");
  }
  return payload as unknown as FeedbackRecord;
}

export default function ChatFeedbackActions({
  sessionId,
  messageId,
  answerText,
}: {
  sessionId: string;
  messageId: string;
  answerText: string;
}) {
  const t = useT();
  const dialogId = useId();
  const [currentVote, setCurrentVote] = useState<Vote | null>(null);
  const [savedVote, setSavedVote] = useState<(FeedbackRecord & { vote: Vote }) | null>(null);
  const [savedReport, setSavedReport] = useState<FeedbackRecord | null>(null);
  const [reported, setReported] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | "">("");
  const [feedbackText, setFeedbackText] = useState("");
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const dialogRootRef = useRef<HTMLDivElement>(null);
  const voteExcerptRef = useRef<HTMLInputElement>(null);
  const reportReasonRef = useRef<HTMLSelectElement>(null);
  const staleCloseRef = useRef<HTMLButtonElement>(null);
  const excerptPreview = useMemo(() => prepareFeedbackExcerpt(answerText), [answerText]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setError("");
    setFeedbackText("");
    setIncludeExcerpt(false);
    setReportReason("");
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    });
  }, []);
  useOverlayRegistration({ id: `chat-feedback-${dialogId}`, open: dialog !== null, onClose: closeDialog, priority: 68 });

  useEffect(() => {
    if (!dialog) return;
    const frame = window.requestAnimationFrame(() => {
      const target = dialog.kind === "report"
        ? reportReasonRef.current
        : dialog.stale ? staleCloseRef.current : voteExcerptRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialog]);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const copyAnswer = useCallback(async () => {
    const copiedOk = await copyTextToClipboard(answerText);
    setCopied(copiedOk);
    setCopyFailed(!copiedOk);
    setAnnouncement(copiedOk ? t("panel.chatFeedback.copied") : "");
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = copiedOk ? window.setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
      setAnnouncement("");
    }, 1_600) : null;
  }, [answerText, t]);

  const recordVote = useCallback(async (vote: Vote, trigger: HTMLButtonElement) => {
    if (busyRef.current) return;
    triggerRef.current = trigger;
    setError("");
    setAnnouncement("");
    if (savedVote?.vote === vote) {
      setFeedbackText(savedVote.feedbackText ?? "");
      setIncludeExcerpt(Boolean(savedVote.answerExcerpt));
      setDialog({ kind: "vote", vote, record: savedVote });
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const record = await postFeedback({ action: "vote", sessionId, messageId, vote });
      setSavedVote({ ...record, vote });
      setCurrentVote(vote);
      setFeedbackText(record.feedbackText ?? "");
      setIncludeExcerpt(Boolean(record.answerExcerpt));
      setDialog({ kind: "vote", vote, record });
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "FEEDBACK_UNAVAILABLE", t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [messageId, savedVote, sessionId, t]);

  const openReport = (trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setReportReason(reportReasonValue(savedReport?.reportReason ?? ""));
    setFeedbackText(savedReport?.feedbackText ?? "");
    setIncludeExcerpt(Boolean(savedReport?.answerExcerpt));
    setError("");
    setAnnouncement("");
    setDialog({ kind: "report" });
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const details = prepareFeedbackText(feedbackText);
    if (busyRef.current || !reportReason || Array.from(details).length < 3 || !dialog || dialog.kind !== "report") return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const record = await postFeedback({
        action: "report",
        sessionId,
        messageId,
        reason: reportReason,
        feedbackText: details,
        ...(includeExcerpt && excerptPreview ? { answerExcerpt: excerptPreview } : {}),
      });
      setSavedReport(record);
      setReported(true);
      setAnnouncement(t("panel.chatFeedback.reportSaved"));
      closeDialog();
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "FEEDBACK_UNAVAILABLE", t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitVoteDetails = async () => {
    const details = prepareFeedbackText(feedbackText);
    if (busyRef.current || !dialog || dialog.kind !== "vote" || (!details && !includeExcerpt)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const record = await postFeedback({
        action: "update-details",
        feedbackId: dialog.record.id,
        revision: dialog.record.revision,
        vote: dialog.vote,
        feedbackText: details,
        answerExcerpt: includeExcerpt && excerptPreview ? excerptPreview : null,
      });
      setSavedVote({ ...record, vote: dialog.vote });
      setCurrentVote(dialog.vote);
      setFeedbackText(record.feedbackText ?? "");
      setIncludeExcerpt(Boolean(record.answerExcerpt));
      closeDialog();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "FEEDBACK_UNAVAILABLE";
      setError(errorMessage(code, t));
      if (code === "FEEDBACK_STALE") {
        setSavedVote(null);
        setCurrentVote(null);
        setDialog({ ...dialog, stale: true });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const clearStaleDialog = () => {
    setSavedVote(null);
    setCurrentVote(null);
    closeDialog();
  };

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

  return (
    <div className="mt-2 min-w-0" data-testid={`chat-feedback-${messageId}`}>
      <div role="group" aria-label={t("panel.chatFeedback.actionsAria")} className="flex flex-wrap items-center gap-1.5 border-t border-[var(--line-soft)] pt-2">
        <button
          type="button"
          data-testid="chat-feedback-copy"
          aria-label={copied ? t("panel.chatFeedback.copied") : t("panel.chatFeedback.copy")}
          title={copied ? t("panel.chatFeedback.copied") : t("panel.chatFeedback.copy")}
          onClick={() => void copyAnswer()}
          className="press inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-[11.5px] text-[var(--ink-faint)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          data-testid="chat-feedback-like"
          aria-label={t("panel.chatFeedback.like")}
          aria-pressed={currentVote === "like"}
          disabled={busy}
          onClick={(event) => void recordVote("like", event.currentTarget)}
          className={`press inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-[11.5px] disabled:opacity-55 ${currentVote === "like" ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"}`}
        >
          <ThumbsUp size={14} />
          <span>{t("panel.chatFeedback.like")}</span>
        </button>
        <button
          type="button"
          data-testid="chat-feedback-dislike"
          aria-label={t("panel.chatFeedback.dislike")}
          aria-pressed={currentVote === "dislike"}
          disabled={busy}
          onClick={(event) => void recordVote("dislike", event.currentTarget)}
          className={`press inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-[11.5px] disabled:opacity-55 ${currentVote === "dislike" ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"}`}
        >
          <ThumbsDown size={14} />
          <span>{t("panel.chatFeedback.dislike")}</span>
        </button>
        <button
          type="button"
          data-testid="chat-feedback-report"
          aria-label={t("panel.chatFeedback.report")}
          aria-pressed={reported}
          onClick={(event) => openReport(event.currentTarget)}
          className={`press inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-[11.5px] ${reported ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"}`}
        >
          <Flag size={14} />
          <span>{t("panel.chatFeedback.report")}</span>
        </button>
      </div>
      {error && !dialog ? <p role="alert" className="mt-1.5 text-[11.5px] text-[var(--md-sys-color-error)]">{error}</p> : null}
      {copyFailed ? <p role="alert" className="mt-1.5 text-[11.5px] text-[var(--md-sys-color-error)]">{t("panel.chatFeedback.copyFailed")}</p> : null}
      {announcement ? <p role="status" aria-live="polite" className="mt-1.5 text-[11.5px] text-[var(--ink-faint)]">{announcement}</p> : null}

      {dialog && typeof document !== "undefined" ? createPortal(
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
      ) : null}
    </div>
  );
}
