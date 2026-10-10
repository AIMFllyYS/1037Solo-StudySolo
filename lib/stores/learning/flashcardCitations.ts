import { create } from "zustand";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { FLASHCARD_CITE_WINDOW_ID } from "@/lib/notes/userNote";
import { flashcardPickerTitle } from "@/lib/notes/library/flashcardSubjects";

// 「复习闪卡页面」管理窗的会话态（单开、不持久化，与 noteCitations 同构）。
// 卡片本体在 useReviewCards（IndexedDB），这里只记住窗口开着、左侧选了哪一科、选中哪张。

interface FlashcardCitationsState {
  open: boolean;
  subjectId: string | null;
  activeCardId: string | null;
  openPicker: (opts?: { subjectId?: string | null }) => void;
  setSubjectId: (subjectId: string | null) => void;
  setActiveCardId: (cardId: string) => void;
  closePicker: () => void;
}

function pickerWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 36, y: 68 }, size: { width: 880, height: 660 } };
  }
  const width = Math.min(900, Math.floor(window.innerWidth * 0.72));
  const height = Math.min(740, Math.floor(window.innerHeight * 0.86));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.12)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.07)),
    },
    size: { width, height },
  };
}

export const useFlashcardCitations = create<FlashcardCitationsState>((set) => ({
  open: false,
  subjectId: null,
  activeCardId: null,

  openPicker: (opts) => {
    const subjectId = opts?.subjectId ?? null;
    const { pos, size } = pickerWindowGeometry();
    useWindowManager.getState().openWindow({
      id: FLASHCARD_CITE_WINDOW_ID,
      type: "flashcard-cite-picker",
      title: flashcardPickerTitle(subjectId),
      pos,
      size,
      data: { subjectId },
    });
    set({ open: true, subjectId, activeCardId: null });
  },

  setSubjectId: (subjectId) => {
    useWindowManager.getState().updateWindow(FLASHCARD_CITE_WINDOW_ID, {
      title: flashcardPickerTitle(subjectId),
      data: { subjectId, activeCardId: null },
    });
    set({ subjectId, activeCardId: null });
  },

  setActiveCardId: (cardId) => {
    useWindowManager.getState().updateWindow(FLASHCARD_CITE_WINDOW_ID, {
      data: { subjectId: useFlashcardCitations.getState().subjectId, activeCardId: cardId },
    });
    set({ activeCardId: cardId });
  },

  closePicker: () => {
    useWindowManager.getState().closeWindow(FLASHCARD_CITE_WINDOW_ID);
    set({ open: false, activeCardId: null });
  },
}));
