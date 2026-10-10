import { createAndOpenNote } from "@/lib/notes/openUserNote";
import { subjectLabel } from "@/lib/notes/userNote";
import { useStore } from "@/lib/stores/ui";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { processRecord } from "@/lib/review/startRecord";
import { getSubject, getCategory, getContentItem } from "@/lib/content-data";
import { isSubjectId } from "@/lib/types/content";
import type { CommitNotesOutput } from "@/lib/ai/agent/tools/commitNotes/types";
import type { CommitFlashcardsOutput } from "@/lib/ai/agent/tools/commitFlashcards/types";
import type { ReviewCardContext } from "@/lib/review/types";

function currentContext(subjectId?: string): ReviewCardContext {
  const ui = useStore.getState();
  const sid = subjectId && isSubjectId(subjectId) ? subjectId : ui.activeSubjectId;
  const subjectName = isSubjectId(sid) ? getSubject(sid)?.name ?? sid : subjectLabel(sid);
  const categoryName = isSubjectId(sid) && ui.activeCategoryId
    ? getCategory(sid, ui.activeCategoryId)?.name ?? ""
    : "";
  const itemTitle =
    isSubjectId(sid) && ui.activeCategoryId && ui.activeItemId
      ? getContentItem(sid, ui.activeCategoryId, ui.activeItemId)?.title ?? ""
      : "";
  const sourceLabel = [subjectName, categoryName || "Agent 对话", itemTitle].filter(Boolean).join(" / ");
  return {
    subjectId: sid,
    categoryId: ui.activeCategoryId || undefined,
    itemId: ui.activeItemId || undefined,
    sourceLabel,
  };
}

export function applyCommitNotes(output: CommitNotesOutput): string {
  return createAndOpenNote(output.subjectId ?? undefined, {
    title: output.title,
    markdown: output.markdown,
  });
}

export function applyCommitFlashcards(output: CommitFlashcardsOutput): string[] {
  const base = currentContext(output.subjectId);
  const ids: string[] = [];
  for (const item of output.items) {
    const id = useReviewCards.getState().addSaved(item.originalText, {
      ...base,
      sourceLabel: item.sourceLabel || base.sourceLabel,
    });
    ids.push(id);
  }
  const first = ids[0];
  if (first) {
    const anchor =
      typeof window === "undefined"
        ? { x: 72, y: 120 }
        : { x: Math.max(24, window.innerWidth * 0.18), y: Math.max(72, window.innerHeight * 0.16) };
    useRecordPreviews.getState().open(first, anchor);
    for (const id of ids) {
      void processRecord(id, output.mode, { userInstruction: output.userInstruction });
    }
  }
  return ids;
}
