"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReviewSidebar, { type ReviewSection } from "./ReviewSidebar";
import { ReviewNotesList, ReviewNoteEditor } from "./ReviewNotesPane";
import { ReviewFlashcardDecks, ReviewFlashcardSession } from "./ReviewFlashcardsPane";
import ReviewQuizPane from "./ReviewQuizPane";
import ReviewMasteryOverview from "./ReviewMasteryOverview";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useReviewSchedule } from "@/lib/review-mode/scheduleStore";
import { useStore } from "@/lib/stores/ui";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";

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
const SECTIONS: readonly ReviewSection[] = ["notes", "flashcards", "quiz", "overview"];
function parseSection(raw: string | null): ReviewSection {
  return SECTIONS.includes(raw as ReviewSection) ? (raw as ReviewSection) : "notes";
}
/** 只改查询串、不触发 Next 路由（避免整页重渲染与编辑器重挂）。 */
function writeUrl(patch: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* 非浏览器环境忽略 */
  }
}

export default function ReviewWorkspace() {
  // 板块与当前笔记写进 URL（?section=&note=）：刷新 / 分享链接 / 从 Class「存为笔记」跳来都能回到原处。
  const params = useSearchParams();
  const [section, setSectionState] = useState<ReviewSection>(() => parseSection(params.get("section")));
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const mobileSidebarOpen = useStore((state) => state.mobileSidebarOpen);
  const setMobileSidebarOpen = useStore((state) => state.setMobileSidebarOpen);
  const isMobile = useIsMobile();
  const sidebarOverlayId = useId();
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
    document.getElementById("mode-mobile-sidebar-toggle")?.focus({ preventScroll: true });
  }, [setMobileSidebarOpen]);
  useOverlayRegistration({
    id: `review-mobile-sidebar-${sidebarOverlayId}`,
    open: isMobile && mobileSidebarOpen,
    onClose: closeMobileSidebar,
    priority: 31,
  });
  useEffect(() => {
    if (isMobile && mobileSidebarOpen) {
      document.querySelector<HTMLElement>("[data-review-sidebar] button:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [isMobile, mobileSidebarOpen]);
  const [activeNoteId, setActiveNoteState] = useState<string | null>(() => params.get("note"));
  const setSection = useCallback((next: ReviewSection) => {
    setSectionState(next);
    writeUrl({ section: next === "notes" ? null : next });
  }, []);
  const selectSection = useCallback((next: ReviewSection) => {
    setSection(next);
    if (isMobile) closeMobileSidebar();
  }, [closeMobileSidebar, isMobile, setSection]);
  const setActiveNoteId = useCallback((id: string | null) => {
    setActiveNoteState(id);
    writeUrl({ note: id });
  }, []);
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

  const sidebarChildren = section === "flashcards" ? (
      <ReviewFlashcardDecks activeSubject={deckSubject} onSelect={setDeckSubject} />
    ) : null;

  return (
    <div className="relative flex h-full min-h-0 w-full bg-[var(--bg-app)]" data-review-workspace data-mobile-sidebar-open={isMobile && mobileSidebarOpen || undefined}>
      <ReviewSidebar
        active={section}
        onSelect={selectSection}
        collapsed={isMobile ? false : collapsed}
        onToggleCollapse={toggleSidebar}
        dueCount={dueCount}
        mobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      >
        {sidebarChildren}
      </ReviewSidebar>
      {isMobile && mobileSidebarOpen ? (
        <button
          type="button"
          className="review-mobile-sidebar-backdrop"
          aria-label="关闭侧栏"
          data-testid="review-mobile-sidebar-backdrop"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* 换板块时整块内容淡入微移（与 Studio / Class / Agent 同一套 .ss-view-enter）。 */}
        <div key={section} className="ss-view-enter h-full min-h-0">
          {section === "notes" && (
            <ReviewNoteEditor
              noteId={activeNoteId}
              navigation={<ReviewNotesList activeId={activeNoteId} onSelect={setActiveNoteId} />}
              onDeleted={() => setActiveNoteId(null)}
              onCreated={setActiveNoteId}
              onRootClick={() => setActiveNoteId(null)}
            />
          )}
          {section === "flashcards" && <ReviewFlashcardSession subjectId={deckSubject} />}
          {section === "quiz" && <ReviewQuizPane />}
          {section === "overview" && <ReviewMasteryOverview />}
        </div>
      </main>
    </div>
  );
}
