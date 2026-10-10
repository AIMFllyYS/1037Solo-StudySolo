"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Loader, X, Trash2, RefreshCw, Check, BookmarkCheck, AlertTriangle,
  BrainCircuit, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, Wand2,
  BookOpenText, PencilLine, FileQuestion, Settings2, Download, Quote, MoreHorizontal,
} from "lucide-react";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews, type RecordPreview } from "@/lib/stores/learning/recordPreviews";
import { processRecord, retryRecord, reviseRecord, type ProcessCallbacks } from "@/lib/review/startRecord";
import SubjectPickerMenu from "@/components/notes/SubjectPickerMenu";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { getSubject } from "@/lib/content-data";
import { isSubjectId } from "@/lib/types/content";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useProcessingDisclosure } from "@/lib/hooks/chat/useProcessingDisclosure";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import ManagedWindow from "@/components/window/ManagedWindow";
import FlipCard from "@/components/review/FlipCard";
import CollapsibleSection from "@/components/review/CollapsibleSection";
import QuizMarkdown from "@/components/quiz/QuizMarkdown";
import type { RecordMode, ReviewCard } from "@/lib/review/types";
import { useCiteToChat } from "@/components/notes/useCiteToChat";
import { formatFlashcardQuote, subjectLabel } from "@/lib/notes/userNote";
import { downloadFlashcardMarkdown, downloadFlashcardsCsv, downloadFlashcardsAnki } from "@/lib/review/exportCards";
import { useT } from "@/lib/i18n";

// 统一设计 token
const BOX = {
  radius: 10,
  bg: "var(--md-sys-color-surface-container)",
  border: "1px solid var(--md-sys-color-outline-variant)",
};
const BOX_HOVER_BG = "var(--md-sys-color-surface-container-high)";

const MODE_DEFS: { mode: RecordMode; label: string; icon: typeof BookOpenText }[] = [
  { mode: "excerpt", label: "摘录", icon: BookOpenText },
  { mode: "cloze", label: "挖空", icon: PencilLine },
  { mode: "quiz", label: "出题", icon: FileQuestion },
  { mode: "custom", label: "自定义", icon: Settings2 },
];

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

/** 原文富文本区（始终默认展开，可手动折叠）。 */
function OriginalRichText({ text }: { text: string }) {
  return (
    <CollapsibleSection label="原文" meta={`${text.length} 字`} defaultOpen>
      <div
        className="scroll-y chat-prose"
        style={{
          maxHeight: 220, overflowY: "auto",
          padding: "10px 12px",
          fontSize: 13, lineHeight: 1.6,
          background: BOX.bg, borderRadius: BOX.radius,
          border: BOX.border,
        }}
      >
        <QuizMarkdown className="chat-prose">{text}</QuizMarkdown>
      </div>
    </CollapsibleSection>
  );
}

/** 4 个模式按钮 — 图标 + 文字，等分一行，填充背景。 */
function ModeButtons({ onPick, onCustomClick, disabled }: { onPick: (mode: RecordMode) => void; onCustomClick?: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {MODE_DEFS.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          data-no-drag
          disabled={disabled}
          className="press"
          onClick={() => mode === "custom" ? onCustomClick?.() : onPick(mode)}
          title={label}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "10px 4px",
            borderRadius: BOX.radius,
            border: BOX.border,
            background: BOX.bg,
            color: "var(--md-sys-color-on-surface-variant)",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = BOX_HOVER_BG; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = BOX.bg; }}
        >
          <Icon size={18} style={{ color: "var(--md-sys-color-primary)" }} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** 自定义模式输入框。 */
function CustomInput({ value, onChange, onSubmit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-no-drag style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: BOX.radius, background: BOX.bg, border: BOX.border }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        placeholder="输入你的处理要求…（如：把公式推导过程写详细）"
        autoFocus
        style={{
          width: "100%", height: 32, padding: "0 10px",
          borderRadius: BOX.radius, border: BOX.border,
          background: "var(--md-sys-color-surface-container-lowest)", color: "var(--ink)", fontSize: 12.5,
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          className="press"
          style={{
            padding: "5px 14px", borderRadius: BOX.radius, border: BOX.border,
            background: "transparent", color: "var(--ink-soft)", fontSize: 12.5, cursor: "pointer",
          }}
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="press"
          style={{
            padding: "5px 14px", borderRadius: BOX.radius, border: "none",
            background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)",
            fontSize: 12.5, fontWeight: 600, cursor: value.trim() ? "pointer" : "default",
            opacity: value.trim() ? 1 : 0.5,
          }}
        >
          提交
        </button>
      </div>
    </div>
  );
}

/** 思考折叠面板（流式 reasoning）。 */
function ThinkingPanel({ content, isProcessing }: { content: string; isProcessing: boolean }) {
  const [isExpanded, setIsExpanded] = useProcessingDisclosure(isProcessing);
  if (!content || content.trim() === "") return null;
  const lines = content.split("\n");
  const preview = lines.slice(0, 2).join("\n").slice(0, 120);

  return (
    <div style={{
      borderRadius: BOX.radius,
      background: BOX.bg,
      border: BOX.border,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
        data-no-drag
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BrainCircuit size={14} style={{ color: "var(--md-sys-color-primary)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--md-sys-color-primary)" }}>思考过程</span>
          {isProcessing && <Loader2 size={12} className="animate-spin" style={{ color: "var(--md-sys-color-primary)" }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
            {isExpanded ? "收起" : "展开"}
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      <AnimatedCollapse isOpen={isExpanded}>
        <div
          className="scroll-y chat-prose"
          style={{
            padding: "8px 12px 12px", borderTop: BOX.border,
            fontSize: 12, lineHeight: 1.6, color: "var(--md-sys-color-on-surface-variant)",
            maxHeight: 200, overflowY: "auto", wordBreak: "break-word",
          }}
        >
          <QuizMarkdown className="chat-prose">{content}</QuizMarkdown>
        </div>
      </AnimatedCollapse>
      <AnimatedCollapse isOpen={!isExpanded}>
        <div style={{ padding: "6px 12px", borderTop: BOX.border, fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5 }}>
          {preview}{content.length > 120 ? "..." : ""}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/** ready 态的优化输入。 */
function ReviseInput({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const disabled = busy || !value.trim();
  return (
    <div data-no-drag style={{ display: "flex", gap: 6 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="优化这张卡…（如：答案更详细 / 挖空挖错了）"
        disabled={busy}
        style={{
          flex: 1,
          minWidth: 0,
          height: 34,
          padding: "0 10px",
          borderRadius: BOX.radius,
          border: BOX.border,
          background: "var(--md-sys-color-surface-container-lowest)",
          color: "var(--ink)",
          fontSize: 12.5,
          outline: "none",
        }}
      />
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="press"
        title="让 AI 优化这张卡"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "0 12px",
          height: 34,
          borderRadius: BOX.radius,
          border: "none",
          background: "var(--md-sys-color-primary)",
          color: "var(--md-sys-color-on-primary)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <Wand2 size={14} /> 优化
      </button>
    </div>
  );
}

function PreviewMoreMenu({
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
function PreviewMoreMenuBody({
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

function ActionBtn({
  onClick,
  icon: Icon,
  label,
  primary,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  const color = danger
    ? "var(--md-sys-color-error)"
    : primary
      ? "var(--md-sys-color-on-primary)"
      : "var(--ink-soft)";
  const bg = primary ? "var(--md-sys-color-primary)" : "transparent";
  const border = primary ? "none" : BOX.border;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "7px 0",
        borderRadius: BOX.radius,
        border,
        background: bg,
        color,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}
