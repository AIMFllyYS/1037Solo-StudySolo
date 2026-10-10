"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Check, Copy, Flag, ThumbsDown, ThumbsUp } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { prepareFeedbackExcerpt, prepareFeedbackText } from "@/lib/chat/feedback/feedbackExcerpt";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { useToast } from "@/lib/stores/toast";
import { feedbackRequest, postFeedback, type FeedbackRecord } from "@/lib/chat/feedback/feedbackClient";
import { errorMessage, reportReasonValue, type Vote, type ReportReason, type DialogState } from "./feedback/model";
import FeedbackDialog from "./feedback/FeedbackDialog";


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
  const mountedRef = useRef(true);
  const requestControllerRef = useRef(new AbortController());
  const mutationRevisionRef = useRef(0);
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

  const operation = useCallback(() => {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    const signal = requestControllerRef.current.signal;
    return { signal, isCurrent: () => mountedRef.current && !signal.aborted
      && owner === getStorageOwner() && epoch === getOwnerEpoch() };
  }, []);

  const showFailure = useCallback((cause: unknown) => {
    const message = errorMessage(cause instanceof Error ? cause.message : "FEEDBACK_UNAVAILABLE", t);
    setError(message);
    useToast.getState().show(message);
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    const restore = () => {
      requestControllerRef.current.abort();
      requestControllerRef.current = new AbortController();
      mutationRevisionRef.current++;
      busyRef.current = false;
      setBusy(false);
      setCurrentVote(null);
      setSavedVote(null);
      setSavedReport(null);
      setReported(false);
      setDialog(null);
      setFeedbackText("");
      setIncludeExcerpt(false);
      setReportReason("");
      setError("");
      setAnnouncement("");
      if (!getStorageOwner()) return;
      const pending = operation();
      const revision = mutationRevisionRef.current;
      void feedbackRequest({ action: "state", sessionId, messageId }, pending.signal).then(payload => {
        if (!pending.isCurrent() || revision !== mutationRevisionRef.current) return;
        if (!Array.isArray(payload.items)) throw new Error("FEEDBACK_UNAVAILABLE");
        const records = payload.items as FeedbackRecord[];
        const vote = records.find(item => item.feedbackType === "like" || item.feedbackType === "dislike");
        const report = records.find(item => item.feedbackType === "report");
        if (vote) {
          const kind = vote.feedbackType as Vote;
          setCurrentVote(kind);
          setSavedVote({ ...vote, vote: kind });
        }
        if (report) { setSavedReport(report); setReported(true); }
      }).catch(cause => {
        if (pending.isCurrent() && revision === mutationRevisionRef.current) showFailure(cause);
      });
    };
    restore();
    const unsubscribe = onStorageOwnerChange(restore);
    return () => {
      mountedRef.current = false;
      requestControllerRef.current.abort();
      unsubscribe();
    };
  }, [messageId, operation, sessionId, showFailure]);

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
      // A user may begin typing before this deferred autofocus runs. Never
      // steal focus from a field they have already chosen inside the dialog.
      if (dialogRootRef.current?.contains(document.activeElement)) return;
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
    if (!copiedOk) useToast.getState().show(t("panel.chatFeedback.copyFailed"));
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
    mutationRevisionRef.current++;
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
    const pending = operation();
    try {
      const record = await postFeedback({ action: "vote", sessionId, messageId, vote }, pending.signal);
      if (!pending.isCurrent()) return;
      setSavedVote({ ...record, vote });
      setCurrentVote(vote);
      setFeedbackText(record.feedbackText ?? "");
      setIncludeExcerpt(Boolean(record.answerExcerpt));
      setDialog({ kind: "vote", vote, record });
    } catch (cause) {
      if (pending.isCurrent()) showFailure(cause);
    } finally {
      if (pending.isCurrent()) { busyRef.current = false; setBusy(false); }
    }
  }, [messageId, operation, savedVote, sessionId, showFailure]);

  const openReport = (trigger: HTMLButtonElement) => {
    if (busyRef.current) return;
    mutationRevisionRef.current++;
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
    mutationRevisionRef.current++;
    setBusy(true);
    setError("");
    const pending = operation();
    try {
      const record = await postFeedback({
        action: "report",
        sessionId,
        messageId,
        reason: reportReason,
        feedbackText: details,
        ...(includeExcerpt && excerptPreview ? { answerExcerpt: excerptPreview } : {}),
      }, pending.signal);
      if (!pending.isCurrent()) return;
      setSavedReport(record);
      setReported(true);
      setAnnouncement(t("panel.chatFeedback.reportSaved"));
      closeDialog();
    } catch (cause) {
      if (pending.isCurrent()) showFailure(cause);
    } finally {
      if (pending.isCurrent()) { busyRef.current = false; setBusy(false); }
    }
  };

  const submitVoteDetails = async () => {
    const details = prepareFeedbackText(feedbackText);
    if (busyRef.current || !dialog || dialog.kind !== "vote" || (!details && !includeExcerpt)) return;
    busyRef.current = true;
    mutationRevisionRef.current++;
    setBusy(true);
    setError("");
    const pending = operation();
    try {
      const record = await postFeedback({
        action: "update-details",
        feedbackId: dialog.record.id,
        revision: dialog.record.revision,
        vote: dialog.vote,
        feedbackText: details,
        answerExcerpt: includeExcerpt && excerptPreview ? excerptPreview : null,
      }, pending.signal);
      if (!pending.isCurrent()) return;
      setSavedVote({ ...record, vote: dialog.vote });
      setCurrentVote(dialog.vote);
      setFeedbackText(record.feedbackText ?? "");
      setIncludeExcerpt(Boolean(record.answerExcerpt));
      closeDialog();
    } catch (cause) {
      if (!pending.isCurrent()) return;
      const code = cause instanceof Error ? cause.message : "FEEDBACK_UNAVAILABLE";
      showFailure(cause);
      if (code === "FEEDBACK_STALE") {
        setSavedVote(null);
        setCurrentVote(null);
        setDialog({ ...dialog, stale: true });
      }
    } finally {
      if (pending.isCurrent()) { busyRef.current = false; setBusy(false); }
    }
  };

  const clearStaleDialog = () => {
    setSavedVote(null);
    setCurrentVote(null);
    closeDialog();
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
          disabled={busy}
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

      {dialog && typeof document !== "undefined" ? <FeedbackDialog dialog={dialog} dialogId={dialogId} dialogRootRef={dialogRootRef} voteExcerptRef={voteExcerptRef} reportReasonRef={reportReasonRef} staleCloseRef={staleCloseRef} busyRef={busyRef} busy={busy} reportReason={reportReason} feedbackText={feedbackText} includeExcerpt={includeExcerpt} error={error} excerptPreview={excerptPreview} setReportReason={setReportReason} setFeedbackText={setFeedbackText} setIncludeExcerpt={setIncludeExcerpt} closeDialog={closeDialog} clearStaleDialog={clearStaleDialog} submitVoteDetails={submitVoteDetails} submitReport={submitReport} /> : null}
    </div>
  );
}
