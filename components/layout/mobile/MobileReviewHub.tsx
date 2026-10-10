"use client";

import { useRouter } from "next/navigation";
import { BookOpenCheck, Layers } from "lucide-react";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { openFlashcardCitePicker, openNoteLibrary } from "@/lib/notes/openUserNote";
import { useStore } from "@/lib/stores/ui";
import { getSubject } from "@/lib/content-data/index";

export default function MobileReviewHub() {
  const subjectId = useStore((s) => s.activeSubjectId);
  const router = useRouter();
  const subjectName = getSubject(subjectId)?.name ?? "当前科目";

  return (
    <div
      className="mobile-review-hub scroll-y h-full"
      data-testid="mobile-review-hub"
    >
      <header className="mobile-review-hub-head">
        <p className="mobile-review-hub-kicker">复习</p>
        <h1>选择一种复习方式</h1>
        <p>
          笔记与闪卡复用现有书架和复习板，不另开存储。当前科目：
          <strong>{subjectName}</strong>
        </p>
      </header>

      <div className="mobile-review-hub-grid">
        <button
          type="button"
          data-testid="mobile-review-notes"
          className="mobile-review-card"
          onClick={() => openNoteLibrary({ subjectId, intent: "browse" })}
        >
          <span className="mobile-review-card-icon" aria-hidden>
            <NotebookFormulaIcon size={22} />
          </span>
          <span className="mobile-review-card-copy">
            <strong>笔记复习</strong>
            <small>打开我的笔记书架，按科目浏览与回顾</small>
          </span>
        </button>

        <button
          type="button"
          data-testid="mobile-review-flashcards"
          className="mobile-review-card"
          onClick={() => {
            openFlashcardCitePicker({ subjectId });
          }}
        >
          <span className="mobile-review-card-icon" aria-hidden>
            <Layers size={22} />
          </span>
          <span className="mobile-review-card-copy">
            <strong>闪卡复习</strong>
            <small>打开复习闪卡页面，翻面记忆或管理卡片</small>
          </span>
        </button>
      </div>

      <button
        type="button"
        data-testid="mobile-review-board"
        className="mobile-review-board-link"
        onClick={() => router.push(`/${subjectId}/review`)}
      >
        <BookOpenCheck size={16} />
        进入本科目复习板
      </button>
    </div>
  );
}
