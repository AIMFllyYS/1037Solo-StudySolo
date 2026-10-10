"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader, X, Trash2, RefreshCw, Check, BookmarkCheck, AlertTriangle } from "lucide-react";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews, type RecordPreview } from "@/lib/stores/learning/recordPreviews";
import { processRecord, retryRecord, reviseRecord, type ProcessCallbacks } from "@/lib/review/startRecord";
import SubjectPickerMenu from "@/components/notes/SubjectPickerMenu";

import { getSubject } from "@/lib/content-data";
import { isSubjectId } from "@/lib/types/content";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

import ManagedWindow from "@/components/window/ManagedWindow";
import FlipCard from "@/components/review/FlipCard";

import QuizMarkdown from "@/components/quiz/QuizMarkdown";
import type { RecordMode } from "@/lib/review/types";
import { useCiteToChat } from "@/components/notes/useCiteToChat";
import { formatFlashcardQuote, subjectLabel } from "@/lib/notes/userNote";

import { OriginalRichText, ThinkingPanel } from "./recordPreview/content";
import { ModeButtons, CustomInput } from "./recordPreview/modeControls";
import { BOX } from "./recordPreview/appearance";
import { ReviseInput } from "./recordPreview/revision";
import { ActionBtn } from "./recordPreview/actions";
import { PreviewMoreMenu } from "./recordPreview/moreMenu";
export default function RecordPreviewWindow({ preview }: { preview: RecordPreview }) {
  const card = useReviewCards((s) => s.byId[preview.cardId]);
  const remove = useReviewCards((s) => s.remove);
  const close = useRecordPreviews((s) => s.close);
  const [flipped, setFlipped] = useState(false);

  const [reasoningBuf, setReasoningBuf] = useState("");
  const [contentBuf, setContentBuf] = useState("");
  const [busy, setBusy] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customExpanded, setCustomExpanded] = useState(false);

  const [reviseText, setReviseText] = useState("");
  const [reviseError, setReviseError] = useState<string | null>(null);
  const { cited, cite } = useCiteToChat();
  const abortRef = useRef<AbortController | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReasoning = useRef("");
  const pendingContent = useRef("");
  const flushUi = useCallback(() => {
    if (uiTimerRef.current) {
      clearTimeout(uiTimerRef.current);
      uiTimerRef.current = null;
    }
    setReasoningBuf(pendingReasoning.current);
    setContentBuf(pendingContent.current);
  }, []);
  const scheduleUi = useCallback(() => {
    if (uiTimerRef.current) return;
    uiTimerRef.current = setTimeout(() => {
      uiTimerRef.current = null;
      flushUi();
    }, 60);
  }, [flushUi]);

  useEffect(() => {
    if (!card) close(preview.id);
  }, [card, close, preview.id]);

  useEffect(() => {
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (card?.status === "saved") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReasoningBuf("");
      setContentBuf("");
      setBusy(false);
    }
  }, [card?.status]);

  if (!card) return null;

  const subjectName =
    isSubjectId(card.subjectId) ? getSubject(card.subjectId)?.name ?? card.subjectId : card.subjectId;

  const makeCallbacks = (): ProcessCallbacks => ({
    onReasoning: (delta) => { pendingReasoning.current += delta; scheduleUi(); },
    onContent: (delta) => { pendingContent.current += delta; scheduleUi(); },
  });

  async function handleProcess(mode: RecordMode, userInstruction?: string) {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setReasoningBuf("");
    setContentBuf("");
    pendingReasoning.current = "";
    pendingContent.current = "";
    setReviseError(null);
    setCustomExpanded(false);
    const r = await processRecord(preview.cardId, mode, userInstruction ? { userInstruction } : {}, makeCallbacks(), controller.signal);
    flushUi();
    setBusy(false);
    if (abortRef.current === controller) abortRef.current = null;
    if (!r.ok) setReviseError(r.error || "处理失败");
  }

  async function handleRetry() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setReasoningBuf("");
    setContentBuf("");
    pendingReasoning.current = "";
    pendingContent.current = "";
    setReviseError(null);
    const r = await retryRecord(preview.cardId, makeCallbacks(), controller.signal);
    flushUi();
    setBusy(false);
    if (abortRef.current === controller) abortRef.current = null;
    if (!r.ok) setReviseError(r.error || "重试失败");
  }

  async function handleRevise() {
    const text = reviseText.trim();
    if (!text || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setReasoningBuf("");
    setContentBuf("");
    pendingReasoning.current = "";
    pendingContent.current = "";
    setReviseError(null);
    const r = await reviseRecord(preview.cardId, text, makeCallbacks(), controller.signal);
    flushUi();
    setBusy(false);
    if (abortRef.current === controller) abortRef.current = null;
    if (r.ok) {
      setReviseText("");
      setFlipped(false);
    } else {
      setReviseError(r.error || "优化失败");
    }
  }

  function handleDiscard() {
    abortRef.current?.abort();
    remove(card.id);
    close(preview.id);
  }

  function handleClose() {
    abortRef.current?.abort();
    close(preview.id);
  }

  const isProcessing = card.status === "processing" || busy;
  const showModeButtons = card.status === "saved" || (card.status === "ready" && !isProcessing);

  return (
    <ManagedWindow
      windowId={preview.id}
      title={`记录到复习板 · ${subjectName}`}
      icon={<BookmarkCheck size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={{ minW: 320, minH: 360 }}
      bodyClassName="flex flex-col"
      registerOverlay={false}
      unmountWhenMinimized
      actions={
        <SubjectPickerMenu
          value={card.subjectId}
          onChange={(next) => {
            if (!next) return;
            useReviewCards.getState().setSubject(card.id, next);
            useWindowManager.getState().updateWindow(preview.id, {
              title: `记录到复习板 · ${subjectLabel(next)}`,
            });
          }}
        />
      }
      frameStyle={{
        background: "var(--md-sys-color-surface-container-lowest)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 0 0 1px var(--md-sys-color-outline-variant)",
        animation: "scale-up 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      }}
    >
        <>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12, gap: 8 }}>
        {/* 原文区 — 所有状态都在顶部显示 */}
        <OriginalRichText text={card.originalText} />

        {/* AI 输出区 — 按状态切换 */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* saved: 模式按钮 */}
          {card.status === "saved" && (
            <>
              <ModeButtons onPick={(mode) => handleProcess(mode)} onCustomClick={() => setCustomExpanded(true)} disabled={busy} />
              {customExpanded && (
                <CustomInput
                  value={customInput}
                  onChange={setCustomInput}
                  onSubmit={() => {
                    if (customInput.trim()) {
                      handleProcess("custom", customInput.trim());
                      setCustomInput("");
                    }
                  }}
                  onCancel={() => setCustomExpanded(false)}
                />
              )}
            </>
          )}

          {/* processing: 思考 + 流式内容 */}
          {(card.status === "processing" || isProcessing) && (
            <>
              <ThinkingPanel content={reasoningBuf} isProcessing={isProcessing} />
              {contentBuf && (
                <div
                  className="scroll-y chat-prose"
                  style={{
                    flex: 1, minHeight: 0, overflowY: "auto",
                    padding: "10px 12px",
                    fontSize: 13, lineHeight: 1.6,
                    background: BOX.bg, borderRadius: BOX.radius,
                    border: BOX.border,
                  }}
                >
                  <QuizMarkdown className="chat-prose">{contentBuf}</QuizMarkdown>
                </div>
              )}
              {!contentBuf && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--md-sys-color-primary)", fontSize: 13, padding: "4px 2px" }}>
                  <Loader size={15} className="animate-spin" />
                  <span>AI 正在处理中…</span>
                </div>
              )}
            </>
          )}

          {/* error */}
          {card.status === "error" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              color: "var(--md-sys-color-error)", fontSize: 13,
              padding: "10px 12px", borderRadius: BOX.radius,
              background: "var(--md-sys-color-error-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
            }}>
              <AlertTriangle size={15} className="shrink-0" /> {card.error || "处理失败"}
            </div>
          )}

          {/* ready: FlipCard + 优化输入 + 模式按钮 */}
          {card.status === "ready" && !isProcessing && (
            <>
              <div style={{ flex: 1, minHeight: 0 }}>
                <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--accent)", padding: "2px 0" }}>
                <Check size={13} /> 已存入「{subjectName}」复习板
              </div>
              {reviseError && (
                <div style={{ fontSize: 11.5, color: "var(--md-sys-color-error)" }}>{reviseError}</div>
              )}
              <ReviseInput
                value={reviseText}
                onChange={(v) => { setReviseText(v); if (reviseError) setReviseError(null); }}
                onSubmit={handleRevise}
                busy={busy}
              />
              {showModeButtons && (
                <>
                  <ModeButtons onPick={(mode) => handleProcess(mode)} onCustomClick={() => setCustomExpanded(true)} disabled={busy} />
                  {customExpanded && (
                    <CustomInput
                      value={customInput}
                      onChange={setCustomInput}
                      onSubmit={() => {
                        if (customInput.trim()) {
                          handleProcess("custom", customInput.trim());
                          setCustomInput("");
                        }
                      }}
                      onCancel={() => setCustomExpanded(false)}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
        </div>

      {/* 底部操作 */}
      <div
        data-no-drag
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderTop: "1px solid var(--md-sys-color-outline-variant)",
          background: "var(--md-sys-color-surface-container-low)",
        }}
      >
        {card.status === "ready" && !isProcessing ? (
          <>
            <ActionBtn onClick={() => close(preview.id)} icon={Check} label="保留" primary />
            <ActionBtn onClick={handleDiscard} icon={X} label="放弃" danger />
            <PreviewMoreMenu
              card={card}
              cited={cited}
              onCite={() => cite(formatFlashcardQuote(card))}
              onRetry={() => { setFlipped(false); handleRetry(); }}
              onDiscard={handleDiscard}
            />
          </>
        ) : card.status === "error" ? (
          <>
            <ActionBtn onClick={handleRetry} icon={RefreshCw} label="重试" primary />
            <ActionBtn onClick={handleDiscard} icon={Trash2} label="删除" danger />
          </>
        ) : (
          <ActionBtn onClick={handleDiscard} icon={X} label="取消" />
        )}
      </div>
        </>
    </ManagedWindow>
  );
}