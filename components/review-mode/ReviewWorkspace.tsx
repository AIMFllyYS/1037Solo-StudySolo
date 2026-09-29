"use client";

import { useMemo, useState } from "react";
import ReviewSidebar, { type ReviewSection } from "./ReviewSidebar";
import { ReviewNotesList, ReviewNoteEditor } from "./ReviewNotesPane";
import { ReviewFlashcardDecks, ReviewFlashcardSession } from "./ReviewFlashcardsPane";
import ReviewQuizPane from "./ReviewQuizPane";
import ReviewMasteryOverview from "./ReviewMasteryOverview";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useReviewSchedule } from "@/lib/review-mode/scheduleStore";

/**
 * Review 复习模式工作区（/review 的中心区）。
 * 左侧栏：笔记 / 闪卡 / 答题 / 掌握度 四板块（同 Studio 侧栏视觉语言，可收起）。
 * 中心区：
 *  - 笔记：Notion 式 Milkdown 编辑器 + 自动保存（复用 useUserNotes / MilkdownNoteEditor）；
 *  - 闪卡：FlipCard 复习会话 + SM-2-lite 调度（lib/review-mode/scheduler）；
 *  - 答题：错题智能出题 / 按章节出题，走 /api/review/quiz（计费同 /api/chat 路径）；
 *  - 掌握度：待复习数 / 近期正确率 / 薄弱点 / 笔记数。
 *
 * AppShell 已为 /review 提供裸壳（保留 TopBar，去掉 Studio 左右栏）；本组件铺满其下方。
 */
export default function ReviewWorkspace() {
  const [section, setSection] = useState<ReviewSection>("notes");
  const [collapsed, setCollapsed] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [deckSubject, setDeckSubject] = useState<string | null>(null);

  // 侧栏「闪卡」徽标：到期（含新卡）张数。
  const cardsById = useReviewCards((s) => s.byId);
  const cardOrder = useReviewCards((s) => s.order);
  const scheduleByCard = useReviewSchedule((s) => s.byCard);
  // 到期判定需要「现在」；用挂载时固定的时间戳，避免每帧调用 Date.now()（纯度规则）。
  const [now] = useState(() => Date.now());
  const dueCount = useMemo(() => {
    return cardOrder
      .map((id) => cardsById[id])
      .filter((c) => c && c.status === "ready")
      .filter((c) => {
        const s = scheduleByCard[c!.id];
        return !s || s.due <= now;
      }).length;
  }, [cardsById, cardOrder, scheduleByCard, now]);

  const sidebarChildren =
    section === "notes" ? (
      <ReviewNotesList activeId={activeNoteId} onSelect={setActiveNoteId} />
    ) : section === "flashcards" ? (
      <ReviewFlashcardDecks activeSubject={deckSubject} onSelect={setDeckSubject} />
    ) : null;

  return (
    <div className="flex h-full min-h-0 w-full bg-[var(--bg-app)]" data-review-workspace>
      <ReviewSidebar
        active={section}
        onSelect={setSection}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        dueCount={dueCount}
      >
        {sidebarChildren}
      </ReviewSidebar>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {section === "notes" && <ReviewNoteEditor noteId={activeNoteId} onDeleted={() => setActiveNoteId(null)} />}
        {section === "flashcards" && <ReviewFlashcardSession subjectId={deckSubject} />}
        {section === "quiz" && <ReviewQuizPane />}
        {section === "overview" && <ReviewMasteryOverview />}
      </main>
    </div>
  );
}
