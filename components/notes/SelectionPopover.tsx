"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { useFloatingChats } from "@/lib/stores/chat/floatingChats";
import { useStore } from "@/lib/stores/ui";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { startRecord } from "@/lib/review/startRecord";
import { currentRecordContext } from "@/lib/review/recordContext";
import { copyTextToClipboard, shouldInterceptSelectionCopy } from "@/lib/clipboard/copyText";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { unwrapMark, wrapRange } from "@/lib/notes/crayonHighlight";
import { createAndOpenClassroomNote } from "@/lib/notes/openUserNote";
import { useSettings } from "@/lib/stores/settings";
import { useT } from "@/lib/i18n";
import {
  SELECTION_ASSISTANT_ACTION_LABELS,
  hasVisibleSelectionActions,
  isSelectionActionVisible,
} from "@/lib/notes/selectionAssistant";
import {
  SELECTION_POPOVER_COLLAPSE_GRACE_MS,
  SELECTION_POPOVER_SCROLL_GRACE_MS,
  shouldIgnoreSelectionDismiss,
} from "@/lib/notes/selectionPopover";
import {
  SELECTION_ACTION_ICONS,
  SelectionPopBtn,
  SelectionPopIconBtn,
  SelectionPopoverCard,
  SelectionPopoverDivider,
} from "./selectionPopoverChrome";
import type { ClassroomNoteSourceKind } from "@/lib/notes/userNote";
import type { SubjectId } from "@/lib/types/content";

interface PopState {
  x: number;
  y: number;
  text: string;
}

function closePopover(
  markRef: React.RefObject<HTMLElement[] | null>,
  actionTakenRef: React.RefObject<boolean>,
  setPop: (v: PopState | null) => void,
  setCopied: (v: boolean) => void,
  unwrap = true,
) {
  if (unwrap && markRef.current && !actionTakenRef.current) {
    markRef.current.forEach(unwrapMark);
  }
  markRef.current = null;
  actionTakenRef.current = false;
  setCopied(false);
  setPop(null);
}

export default function SelectionPopover({
  containerRef,
  recordSubjectId,
  noteSource,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 复习板内划词时强制记录到本科目（出处标为「复习板」）。 */
  recordSubjectId?: SubjectId;
  /** 课堂便签出处。Agent 面板传 agent，复习板传 review。 */
  noteSource?: ClassroomNoteSourceKind;
}) {
  const t = useT();
  const setQuotedText = useChatUI((s) => s.setQuotedText);
  const openWindow = useFloatingChats((s) => s.openWindow);
  const selectionAssistantEnabled = useSettings((s) => s.selectionAssistantEnabled);
  const selectionAssistantActions = useSettings((s) => s.selectionAssistantActions);
  const siteAssistantOn = selectionAssistantEnabled !== false && hasVisibleSelectionActions(selectionAssistantActions);
  const [pop, setPop] = useState<PopState | null>(null);
  const [copied, setCopied] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement[] | null>(null);
  const actionTakenRef = useRef(false);
  const popTextRef = useRef("");
  const ignoreUntilRef = useRef(0);

  const closePopoverCallback = useCallback(() => {
    closePopover(markRef, actionTakenRef, setPop, setCopied);
  }, []);

  useOverlayRegistration({
    id: "selection-popover",
    open: !!pop,
    onClose: closePopoverCallback,
    priority: 70,
  });

  useLayoutEffect(() => {
    popTextRef.current = pop?.text ?? "";
  }, [pop?.text]);

  useLayoutEffect(() => {
    if (boxRef.current) {
      setBoxWidth(boxRef.current.offsetWidth);
    }
  }, [pop, copied]);

  useEffect(() => {
    const root = containerRef.current;
    if (root) root.setAttribute("data-selection-host", "");
    return () => {
      root?.removeAttribute("data-selection-host");
    };
  }, [containerRef]);

  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if (!siteAssistantOn) return;
      if (boxRef.current && boxRef.current.contains(e.target as Node)) return;
      window.setTimeout(() => {
        if (markRef.current && !actionTakenRef.current) {
          markRef.current.forEach(unwrapMark);
        }
        markRef.current = null;
        actionTakenRef.current = false;
        setCopied(false);

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          if (shouldIgnoreSelectionDismiss(performance.now(), ignoreUntilRef.current)) return;
          setPop(null);
          return;
        }
        const text = sel.toString().trim();
        if (text.length < 2) {
          if (shouldIgnoreSelectionDismiss(performance.now(), ignoreUntilRef.current)) return;
          setPop(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const root = containerRef.current;
        if (!root || !root.contains(range.commonAncestorContainer)) return;
        const rect = typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : { left: 24, top: 24, width: 0, height: 0 };
        // 先记下几何再 wrap：Agent 虚拟列表改行高会滚一下，grace 内不关助手。
        ignoreUntilRef.current = performance.now() + SELECTION_POPOVER_SCROLL_GRACE_MS;
        const marks = wrapRange(range);
        markRef.current = marks;
        sel.removeAllRanges();
        ignoreUntilRef.current = Math.max(
          ignoreUntilRef.current,
          performance.now() + SELECTION_POPOVER_COLLAPSE_GRACE_MS,
        );
        setPop({ x: rect.left + rect.width / 2, y: rect.top, text });
      }, 0);
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef, siteAssistantOn]);

  useEffect(() => {
    function onScroll() {
      if (shouldIgnoreSelectionDismiss(performance.now(), ignoreUntilRef.current)) return;
      closePopover(markRef, actionTakenRef, setPop, setCopied);
    }
    const root = containerRef.current;
    // 不用 capture：只要容器自己滚。virtualizer 回调整滚动仍会打到这里，靠 grace 忽略。
    root?.addEventListener("scroll", onScroll);
    return () => {
      root?.removeEventListener("scroll", onScroll);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!pop) return;

    function onCopy(e: ClipboardEvent) {
      const text = popTextRef.current;
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (!shouldInterceptSelectionCopy(text, document.activeElement, selection)) return;
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
      setCopied(true);
    }

    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [pop]);

  const handleCopy = useCallback(async () => {
    if (!pop) return;
    const ok = await copyTextToClipboard(pop.text);
    if (ok) setCopied(true);
  }, [pop]);

  const showCopy = isSelectionActionVisible(selectionAssistantActions, "copy");
  const showExplain = isSelectionActionVisible(selectionAssistantActions, "explain");
  const showRecord = isSelectionActionVisible(selectionAssistantActions, "record");
  const showNote = isSelectionActionVisible(selectionAssistantActions, "note");
  const showAsk = isSelectionActionVisible(selectionAssistantActions, "ask");
  const showQuote = isSelectionActionVisible(selectionAssistantActions, "quote");
  const showMid = showExplain || showRecord || showNote || showAsk;

  useEffect(() => {
    if (siteAssistantOn) return;
    closePopover(markRef, actionTakenRef, setPop, setCopied);
  }, [siteAssistantOn]);

  if (!pop) return null;

  function cleanupMarks() {
    if (markRef.current) {
      const marks = markRef.current;
      setTimeout(() => marks.forEach(unwrapMark), 300);
      markRef.current = null;
    }
  }

  function spawn(seedMode: "explain" | "example" | "ask") {
    if (!pop) return;
    actionTakenRef.current = true;
    openWindow({ anchor: { x: pop.x, y: pop.y }, seedMode, seedText: pop.text });
    setCopied(false);
    setPop(null);
    cleanupMarks();
  }

  function handleQuote() {
    if (!pop) return;
    actionTakenRef.current = true;
    setQuotedText(pop.text);
    // 「引用」必须看得见：切到右栏 ai tab 并展开右栏，与 citeUserNoteToMainAgent 一致。
    // Agent 档位下引用进的是中央主对话，不动 Studio 档位的右栏开合。
    const ui = useStore.getState();
    ui.setRightTab("ai");
    ui.setMobileTab("ai");
    if (!isAgentWorkspace()) ui.setRightCollapsedForProfile(ui.layoutProfile, false);
    setCopied(false);
    setPop(null);
    cleanupMarks();
  }

  function handleRecord() {
    if (!pop) return;
    actionTakenRef.current = true;
    startRecord(pop.text, currentRecordContext(recordSubjectId), { x: pop.x, y: pop.y });
    setCopied(false);
    setPop(null);
    cleanupMarks();
  }

  function handleNote() {
    if (!pop) return;
    actionTakenRef.current = true;
    createAndOpenClassroomNote({
      quote: pop.text,
      sourceKind: noteSource ?? (recordSubjectId ? "review" : "content"),
      recordSubjectId,
      anchor: { x: pop.x, y: pop.y },
    });
    setCopied(false);
    setPop(null);
    cleanupMarks();
  }

  const halfW = (boxWidth || 300) / 2;
  const left = Math.min(
    Math.max(pop.x, halfW + 8),
    window.innerWidth - halfW - 8,
  );
  const top = Math.max(pop.y - 8, 10);

  return createPortal(
    <div
      style={{ position: "fixed", left, top, width: "max-content", transform: "translate(-50%, -100%)", zIndex: 9999 }}
    >
      <SelectionPopoverCard
        boxRef={boxRef}
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {showCopy && (
          <SelectionPopIconBtn
            onClick={() => void handleCopy()}
            icon={SELECTION_ACTION_ICONS.copy}
            copiedIcon={Check}
            copied={copied}
            title={t(SELECTION_ASSISTANT_ACTION_LABELS.copy)}
          />
        )}
        {showCopy && showMid && <SelectionPopoverDivider />}
        {showExplain && (
          <SelectionPopBtn onClick={() => spawn("explain")} icon={SELECTION_ACTION_ICONS.explain} label={t(SELECTION_ASSISTANT_ACTION_LABELS.explain)} />
        )}
        {showRecord && (
          <SelectionPopBtn onClick={handleRecord} icon={SELECTION_ACTION_ICONS.record} label={t(SELECTION_ASSISTANT_ACTION_LABELS.record)} />
        )}
        {showNote && (
          <SelectionPopBtn onClick={handleNote} icon={SELECTION_ACTION_ICONS.note} label={t(SELECTION_ASSISTANT_ACTION_LABELS.note)} />
        )}
        {showAsk && (
          <SelectionPopBtn onClick={() => spawn("ask")} icon={SELECTION_ACTION_ICONS.ask} label={t(SELECTION_ASSISTANT_ACTION_LABELS.ask)} />
        )}
        {showQuote && (showCopy || showMid) && <SelectionPopoverDivider />}
        {showQuote && (
          <SelectionPopBtn onClick={handleQuote} icon={SELECTION_ACTION_ICONS.quote} label={t(SELECTION_ASSISTANT_ACTION_LABELS.quote)} />
        )}
      </SelectionPopoverCard>
    </div>,
    document.body,
  );
}
