"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { Layers, RotateCcw } from "lucide-react";
import FlipCard from "@/components/review/FlipCard";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useReviewSchedule } from "@/lib/review-mode/scheduleStore";
import { listFlashcardSubjectGroups } from "@/lib/notes/library/flashcardSubjects";
import type { ReviewCard } from "@/lib/review/types";
import type { ReviewGrade } from "@/lib/review-mode/scheduler";
import { useT } from "@/lib/i18n";

const GRADES: { id: ReviewGrade; labelKey: string; hintKey: string; tone: string }[] = [
  { id: "again", labelKey: "review.flashcards.grade.again", hintKey: "review.flashcards.grade.againHint", tone: "var(--md-sys-color-error)" },
  { id: "hard", labelKey: "review.flashcards.grade.hard", hintKey: "review.flashcards.grade.hardHint", tone: "var(--color-warning)" },
  { id: "good", labelKey: "review.flashcards.grade.good", hintKey: "review.flashcards.grade.goodHint", tone: "var(--color-info)" },
  { id: "easy", labelKey: "review.flashcards.grade.easy", hintKey: "review.flashcards.grade.easyHint", tone: "var(--color-success)" },
];

function readyCardsOf(byId: Record<string, ReviewCard>, order: string[], subjectId: string | null): ReviewCard[] {
  return order
    .map((id) => byId[id])
    .filter((c): c is ReviewCard => Boolean(c) && c.status === "ready")
    .filter((c) => (subjectId == null ? true : c.subjectId === subjectId));
}

/** 学科闪卡分组（渲染进侧栏 children）。 */
export function ReviewFlashcardDecks({
  activeSubject,
  onSelect,
}: {
  activeSubject: string | null;
  onSelect: (subjectId: string | null) => void;
}) {
  const t = useT();
  const byId = useReviewCards((s) => s.byId);
  const order = useReviewCards((s) => s.order);
  const scheduleByCard = useReviewSchedule((s) => s.byCard);

  const groups = useMemo(() => listFlashcardSubjectGroups(), []);
  const [now] = useState(() => Date.now());

  const countFor = (subjectId: string | null) => {
    const cards = readyCardsOf(byId, order, subjectId);
    const due = cards.filter((c) => {
      const s = scheduleByCard[c.id];
      return !s || s.due <= now;
    }).length;
    return { total: cards.length, due };
  };

  const all = countFor(null);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={activeSubject === null ? "true" : undefined}
        className={clsx(
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
          activeSubject === null
            ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
        )}
      >
        <Layers size={14} className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{t("review.flashcards.allSubjects")}</span>
        {all.due > 0 && <span className="text-[11px] font-semibold text-[var(--accent)]">{all.due}</span>}
      </button>
      {groups.map((group) =>
        group.subjects
          .map((subj) => ({ subj, count: countFor(subj.id) }))
          .filter(({ count }) => count.total > 0)
          .map(({ subj, count }) => (
            <button
              key={subj.id}
              type="button"
              onClick={() => onSelect(subj.id)}
              aria-current={activeSubject === subj.id ? "true" : undefined}
              data-testid="review-deck-item"
              className={clsx(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
                activeSubject === subj.id
                  ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-left">{subj.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{count.total}</span>
              {count.due > 0 && <span className="shrink-0 text-[11px] font-semibold text-[var(--accent)]">·{count.due}</span>}
            </button>
          )),
      )}
    </div>
  );
}

/** 闪卡复习会话（中心区）：到期卡片逐张翻面 + 四档评分驱动 SRS。 */
export function ReviewFlashcardSession({ subjectId }: { subjectId: string | null }) {
  const t = useT();
  const byId = useReviewCards((s) => s.byId);
  const order = useReviewCards((s) => s.order);
  const scheduleByCard = useReviewSchedule((s) => s.byCard);
  const grade = useReviewSchedule((s) => s.grade);

  const [onlyDue, setOnlyDue] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  // 到期判定用挂载时固定的时间戳（纯度规则不允许渲染期调用 Date.now）；
  // 「再来一轮」时刷新，让这一轮里刚评分推远的卡片按新时间被筛掉。
  const [now, setNow] = useState(() => Date.now());

  const allReady = useMemo(() => readyCardsOf(byId, order, subjectId), [byId, order, subjectId]);

  const startRound = useCallback(() => {
    setNow(Date.now());
    setIndex(0);
    setFlipped(false);
    setReviewedCount(0);
  }, []);

  // 切科目 / 切筛选时开新一轮（React 官方「渲染期依据 state 变化调整 state」模式）。
  const [roundKey, setRoundKey] = useState(`${subjectId ?? "all"}|${onlyDue}`);
  const nextRoundKey = `${subjectId ?? "all"}|${onlyDue}`;
  if (roundKey !== nextRoundKey) {
    setRoundKey(nextRoundKey);
    if (index !== 0) setIndex(0);
    if (flipped) setFlipped(false);
    if (reviewedCount !== 0) setReviewedCount(0);
  }

  // 队列基于 now 快照筛「到期」，避免每帧 Date.now()。
  const queue = useMemo(
    () =>
      allReady
        .filter((c) => (onlyDue ? !scheduleByCard[c.id] || scheduleByCard[c.id]!.due <= now : true))
        .map((c) => c.id),
    // scheduleByCard 变化不该重排当前轮次的队列（评分后卡片会移出但不打断当前流程）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReady, onlyDue, now],
  );

  const dueSnapshot = useMemo(
    () => allReady.filter((c) => !scheduleByCard[c.id] || scheduleByCard[c.id]!.due <= now).length,
    [allReady, scheduleByCard, now],
  );

  const currentId = queue[index];
  const current = currentId ? byId[currentId] : undefined;

  const dueCountLabel = t("review.flashcards.due", { count: dueSnapshot });

  if (allReady.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--ink-faint)]">{t("review.flashcards.empty")}</p>
      </div>
    );
  }

  // 队列跑完 / 一开始就没有到期卡
  if (!current) {
    const finished = reviewedCount > 0;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-[15px] font-semibold text-[var(--ink)]">
          {finished ? t("review.flashcards.session.done") : t("review.flashcards.session.empty")}
        </p>
        {finished && (
          <p className="text-[13px] text-[var(--ink-soft)]">
            {t("review.flashcards.session.doneHint", { count: reviewedCount })}
          </p>
        )}
        <div className="flex gap-2">
          {onlyDue && (
            <button
              type="button"
              onClick={() => setOnlyDue(false)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            >
              {t("review.flashcards.session.reviewAll")}
            </button>
          )}
          <button
            type="button"
            onClick={startRound}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-weak)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-ink)] hover:brightness-95"
          >
            <RotateCcw size={14} /> {t("review.flashcards.session.restart")}
          </button>
        </div>
      </div>
    );
  }

  const onGrade = (g: ReviewGrade) => {
    grade(current.id, g);
    setReviewedCount((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  return (
    <div className="flex h-full flex-col" data-testid="review-flashcard-session">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-2.5">
        <span className="text-[12.5px] text-[var(--ink-soft)]">
          {t("review.flashcards.session.progress", { current: index + 1, total: queue.length })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--ink-faint)]">{dueCountLabel}</span>
          <button
            type="button"
            onClick={() => setOnlyDue((v) => !v)}
            className={clsx(
              "rounded-md px-2 py-1 text-[11px] font-medium",
              onlyDue ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]",
            )}
          >
            {onlyDue ? t("review.flashcards.session.onlyDue") : t("review.flashcards.session.reviewAll")}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-5">
        <div className="mx-auto h-full max-w-2xl">
          <FlipCard
            card={{ cardType: current.cardType, front: current.front, back: current.back, explanation: current.explanation }}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
          />
        </div>
      </div>

      <div className="border-t border-[var(--line-soft)] px-5 py-3">
        {!flipped ? (
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="mx-auto block rounded-lg bg-[var(--accent-weak)] px-4 py-2 text-[13px] font-medium text-[var(--accent-ink)] hover:brightness-95"
          >
            {t("review.flashcards.session.reveal")}
          </button>
        ) : (
          <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
            {GRADES.map((gr) => (
              <button
                key={gr.id}
                type="button"
                onClick={() => onGrade(gr.id)}
                data-testid={`review-grade-${gr.id}`}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--line)] py-2 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--bg-muted)]"
                style={{ borderTopColor: gr.tone, borderTopWidth: 2 }}
              >
                <span>{t(gr.labelKey)}</span>
                <span className="text-[10.5px] font-normal text-[var(--ink-faint)]">{t(gr.hintKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
