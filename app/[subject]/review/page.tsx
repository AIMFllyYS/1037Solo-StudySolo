"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ChevronUp, Trash2, Download, Loader, RefreshCw,
  AlertTriangle, BookOpenCheck, Home, GraduationCap, Wand2,
} from "lucide-react";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { useStore } from "@/lib/store";
import { getSubject, firstLearnHref } from "@/lib/content-data";
import { isSubjectId } from "@/lib/types/content";
import { isSubjectInRuntime } from "@/lib/content/offlineSubjects";
import { retryRecord } from "@/lib/review/startRecord";
import type { ReviewCard } from "@/lib/review/types";
import FlipCard from "@/components/review/FlipCard";
import QuizMarkdown from "@/components/quiz/QuizMarkdown";
import SelectionPopover from "@/components/notes/SelectionPopover";
import { useReviewKeyboard } from "@/lib/keyboard/useReviewKeyboard";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";

function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReviewBoardPage() {
  const params = useParams();
  const subjectParam = String(params?.subject ?? "");
  const subjectId = isSubjectId(subjectParam) && isSubjectInRuntime(subjectParam) ? subjectParam : null;

  const setActiveSubject = useStore((s) => s.setActiveSubject);
  const hydrated = useReviewCards((s) => s._hasHydrated);
  const byId = useReviewCards((s) => s.byId);
  const order = useReviewCards((s) => s.order);
  const remove = useReviewCards((s) => s.remove);

  const boardRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (subjectId) setActiveSubject(subjectId);
  }, [subjectId, setActiveSubject]);

  // 本科目卡片（最新在前），随 store 响应式更新
  const cards: ReviewCard[] = useMemo(() => {
    if (!subjectId) return [];
    return order
      .map((id) => byId[id])
      .filter((c): c is ReviewCard => !!c && c.subjectId === subjectId)
      .reverse();
  }, [order, byId, subjectId]);

  // 渲染期夹紧索引（不在 effect 里 setState，避免级联渲染）
  const safeIdx = cards.length === 0 ? 0 : Math.min(idx, cards.length - 1);
  const current = cards[safeIdx];

  // 切卡 = 改索引并复位翻面（所有切卡入口统一走这里）
  const go = useCallback((n: number) => {
    setIdx(n);
    setFlipped(false);
  }, []);

  const registerReviewKeys = useReviewKeyboard((s) => s.register);
  const unregisterReviewKeys = useReviewKeyboard((s) => s.unregister);

  useEffect(() => {
    registerReviewKeys({
      onPrev: () => go(Math.max(0, safeIdx - 1)),
      onNext: () => go(Math.min(cards.length - 1, safeIdx + 1)),
      onFlip: () => setFlipped((f) => !f),
      canFlip: current?.status === "ready",
    });
    return () => unregisterReviewKeys();
  }, [cards.length, safeIdx, current?.status, go, registerReviewKeys, unregisterReviewKeys]);

  if (!subjectId) {
    return <CenterNote text="未知科目。" />;
  }
  const subject = getSubject(subjectId);
  const subjectName = subject?.name ?? subjectId;
  const learnHref = subject ? firstLearnHref(subject) : null;

  function handleDeleteCurrent() {
    if (!current) return;
    setFlipped(false);
    remove(current.id);
  }

  return (
    <div ref={boardRef} className="scroll-y" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      {/* 顶栏 */}
      <div
        className="review-board-toolbar"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <BookOpenCheck size={18} style={{ color: "var(--accent)" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{subjectName} · 复习板</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
            {cards.length} 张记忆卡 · 点击卡片翻面 · 可在卡上继续划词记录
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {learnHref && (
            <Link href={learnHref} className="press" style={pillBtn(false)} title="开始学习">
              <GraduationCap size={14} /> 学习
            </Link>
          )}
          <Link href="/" className="press" style={pillBtn(false)} title="返回首页">
            <Home size={14} /> 首页
          </Link>

          {/* 下载菜单 */}
          <div style={{ position: "relative" }}>
            <button
              className="press"
              style={pillBtn(true)}
              onClick={() => setMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              disabled={order.length === 0}
              title="下载为 JSON"
            >
              <Download size={14} /> 下载
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 20,
                  minWidth: 168,
                  background: "var(--md-sys-color-surface-container-low)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  boxShadow: "0 10px 30px -8px rgba(0,0,0,0.3)",
                  padding: 5,
                }}
              >
                <MenuItem
                  label={`本科目（${cards.length} 张）`}
                  onClick={() => {
                    downloadJSON(
                      useReviewCards.getState().exportSubject(subjectId),
                      `review-${subjectId}-${new Date().toISOString().slice(0, 10)}.json`,
                    );
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  label="全部记忆（所有科目）"
                  onClick={() => {
                    downloadJSON(
                      useReviewCards.getState().exportAll(),
                      `review-all-${new Date().toISOString().slice(0, 10)}.json`,
                    );
                    setMenuOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 卡片区 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 16 }}>
        {!hydrated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-faint)" }}>
            <Loader size={16} className="animate-spin" /> 载入复习卡…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState subjectName={subjectName} />
        ) : (
          <>
            <div style={{ width: "100%", maxWidth: 660, height: "min(62vh, 560px)" }}>
              {current && <CardSlot card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onRemove={() => remove(current.id)} />}
            </div>

            {/* 底部控制条：◀ ▶ + 跳转选卡 + 删卡 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="press" style={navBtn} onClick={() => go(Math.max(0, safeIdx - 1))} disabled={safeIdx <= 0} title="上一张">
                <ChevronLeft size={18} />
              </button>

              <CardJumpControl count={cards.length} index={safeIdx} onPick={go} />

              <button className="press" style={navBtn} onClick={() => go(Math.min(cards.length - 1, safeIdx + 1))} disabled={safeIdx >= cards.length - 1} title="下一张">
                <ChevronRight size={18} />
              </button>

              <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 2px" }} />

              <button
                className="press"
                style={{ ...navBtn, opacity: current?.status === "ready" || current?.status === "saved" || current?.status === "error" ? 1 : 0.45 }}
                disabled={current?.status !== "ready" && current?.status !== "saved" && current?.status !== "error"}
                onClick={(e) => {
                  if (current && (current.status === "ready" || current.status === "saved" || current.status === "error")) {
                    useRecordPreviews.getState().open(current.id, { x: e.clientX, y: e.clientY });
                  }
                }}
                title="在浮窗中处理/优化本张卡"
              >
                <Wand2 size={16} />
              </button>

              <button className="press" style={{ ...navBtn, color: "var(--md-sys-color-error)" }} onClick={handleDeleteCurrent} title="删除本张卡">
                <Trash2 size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 板内划词记录（强制记录到本科目） */}
      <SelectionPopover containerRef={boardRef} recordSubjectId={subjectId} noteSource="review" />
    </div>
  );
}

/** 单卡槽：按状态渲染 ready=FlipCard / saved,processing / error。 */
function CardSlot({
  card,
  flipped,
  onFlip,
  onRemove,
}: {
  card: ReviewCard;
  flipped: boolean;
  onFlip: () => void;
  onRemove: () => void;
}) {
  if (card.status === "ready") {
    return <FlipCard key={card.id} card={card} flipped={flipped} onFlip={onFlip} />;
  }
  const isError = card.status === "error";
  const isProcessing = card.status === "processing" || card.status === "parsing";
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        borderRadius: 18,
        border: "1px solid var(--line)",
        background: "var(--bg-panel)",
        padding: 24,
        textAlign: "center",
      }}
    >
      {isError ? (
        <>
          <AlertTriangle size={26} style={{ color: "var(--md-sys-color-error)" }} />
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{card.error || "处理失败"}</div>
          <div className="scroll-y chat-prose" style={{ maxHeight: 160, overflowY: "auto", fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.6, width: "100%" }}>
            <QuizMarkdown className="chat-prose">{card.originalText}</QuizMarkdown>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="press" style={pillBtn(true)} onClick={() => void retryRecord(card.id)}>
              <RefreshCw size={14} /> 重试
            </button>
            <button className="press" style={{ ...pillBtn(false), color: "var(--md-sys-color-error)" }} onClick={onRemove}>
              <Trash2 size={14} /> 删除
            </button>
          </div>
        </>
      ) : isProcessing ? (
        <>
          <Loader size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>AI 正在处理中…</div>
          <div className="scroll-y chat-prose" style={{ maxHeight: 160, overflowY: "auto", fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.6, width: "100%" }}>
            <QuizMarkdown className="chat-prose">{card.originalText}</QuizMarkdown>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>原文已保存</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>点击下方魔棒按钮选择处理方式</div>
          <div className="scroll-y chat-prose" style={{ maxHeight: 200, overflowY: "auto", fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.6, width: "100%" }}>
            <QuizMarkdown className="chat-prose">{card.originalText}</QuizMarkdown>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ subjectName }: { subjectName: string }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 420, color: "var(--ink-faint)" }}>
      <BookOpenCheck size={40} style={{ color: "var(--line)", marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
        「{subjectName}」还没有记忆卡
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        去正文或 AI 回答里 <b>划词</b> 选「记录」，或 <b>右键</b> 任意消息选「记录到复习板」。
        AI 会自动把知识点变填空卡、把题目变问答卡，存到这里供你复习。
      </div>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="press"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 7,
        border: "none",
        background: "transparent",
        color: "var(--ink)",
        fontSize: 13,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--md-sys-color-secondary-container)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}

/** 跳卡控件：点击向上弹出数字方格面板，选第几张直接跳转（替代原生下拉）。 */
function CardJumpControl({ count, index, onPick }: { count: number; index: number; onPick: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const closeJump = useCallback(() => setOpen(false), []);
  useOverlayRegistration({ id: "card-jump-control", open, onClose: closeJump, priority: 65 });

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDocPointer);
    return () => window.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="press"
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 36,
          minWidth: 108,
          padding: "0 12px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: 9,
          border: "1px solid var(--line)",
          background: "var(--bg-panel)",
          color: "var(--ink)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
        title="跳转到第 N 张"
      >
        第 {index + 1} / {count} 张
        <ChevronUp size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div
          className="scroll-y"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(100% + 8px)",
            zIndex: 30,
            width: 252,
            maxHeight: 240,
            overflowY: "auto",
            padding: 8,
            background: "var(--md-sys-color-surface-container-low)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {Array.from({ length: count }, (_, i) => {
              const active = i === index;
              return (
                <button
                  key={i}
                  className="press"
                  onClick={() => {
                    onPick(i);
                    setOpen(false);
                  }}
                  style={{
                    height: 38,
                    borderRadius: 8,
                    border: active ? "none" : "1px solid var(--line)",
                    background: active ? "var(--md-sys-color-primary)" : "var(--bg-panel)",
                    color: active ? "var(--md-sys-color-on-primary)" : "var(--ink-soft)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title={`第 ${i + 1} 张`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CenterNote({ text }: { text: string }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-faint)" }}>
      {text}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 9,
  border: "1px solid var(--line)",
  background: "var(--bg-panel)",
  color: "var(--ink-soft)",
  cursor: "pointer",
};

function pillBtn(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "7px 12px",
    borderRadius: 9,
    border: primary ? "none" : "1px solid var(--line)",
    background: primary ? "var(--md-sys-color-primary)" : "var(--bg-panel)",
    color: primary ? "var(--md-sys-color-on-primary)" : "var(--ink-soft)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
  };
}
