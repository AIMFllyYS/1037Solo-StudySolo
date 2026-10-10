import { create } from "zustand";
import { useStore } from "@/lib/store";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { getQuizExplainModelId } from "@/lib/hooks/learning/useQuizExplainModel";
import { formatQuestionContext } from "@/lib/quiz/formatQuestionContext";
import type { QuizQuestion } from "@/lib/quiz/types";
import type { ChatContext } from "@/lib/types/chat";

export const QUIZ_EXPLAIN_MIN_W = 480;
export const QUIZ_EXPLAIN_MIN_H = 420;
export const QUIZ_EXPLAIN_WINDOW_PREFIX = "quiz-explain:";

const SIZE_KEY = "quizExplainWindowSize";

export interface QuizExplainWin {
  id: string;
  sessionId: string;
  modelId: string;
  questionId: string;
  seedText: string;
  seedNonce: number;
}

interface QuizExplainState {
  windows: QuizExplainWin[];
  sessionByQuestionId: Record<string, string>;
  openWindow: (question: QuizQuestion) => string;
  closeWindow: (id: string) => void;
  updateWindow: (id: string, patch: Partial<QuizExplainWin>) => void;
}

function quizExplainWindowId(questionId: string): string {
  return `${QUIZ_EXPLAIN_WINDOW_PREFIX}${questionId}`;
}

function currentChatContext(): ChatContext {
  const state = useStore.getState();
  return {
    subjectId: state.activeSubjectId,
    categoryId: state.activeCategoryId,
    itemId: state.activeItemId,
    currentTopic: `${state.activeSubjectId} ${state.activeCategoryId} ${state.activeItemId}`,
  };
}

function titleFromQuestion(question: QuizQuestion): string {
  const stem = question.stem.trim().replace(/\s+/g, " ");
  if (!stem) return "深度解析";
  return stem.length > 18 ? `深度解析 · ${stem.slice(0, 18)}…` : `深度解析 · ${stem}`;
}

function defaultSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 880, height: 780 };
  return {
    width: Math.max(QUIZ_EXPLAIN_MIN_W, Math.min(1100, window.innerWidth - 32)),
    height: Math.max(QUIZ_EXPLAIN_MIN_H, Math.min(920, window.innerHeight - 32)),
  };
}

function getSavedSize(): { width: number; height: number } {
  const fallback = defaultSize();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return fallback;
    const size = JSON.parse(raw) as { width?: number; height?: number };
    const width = Number(size.width);
    const height = Number(size.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return fallback;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;
    return {
      width: Math.max(QUIZ_EXPLAIN_MIN_W, Math.min(width, maxW)),
      height: Math.max(QUIZ_EXPLAIN_MIN_H, Math.min(height, maxH)),
    };
  } catch {
    return fallback;
  }
}

function initialGeometry(existingCount: number) {
  const size = getSavedSize();
  const offset = (existingCount % 5) * 28;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  return {
    pos: {
      x: Math.max(16, Math.min(Math.round(vw * 0.08) + offset, vw - size.width - 16)),
      y: Math.max(16, Math.min(Math.round(vh * 0.06) + offset, vh - size.height - 16)),
    },
    size,
  };
}

export const useQuizExplain = create<QuizExplainState>((set, get) => ({
  windows: [],
  sessionByQuestionId: {},

  openWindow: (question) => {
    const id = quizExplainWindowId(question.id);
    const existing = get().windows.find((win) => win.id === id);
    if (existing) {
      useWindowManager.getState().restoreWindow(id);
      useWindowManager.getState().bringToFront(id);
      return id;
    }

    const seedText = formatQuestionContext(question);
    const title = titleFromQuestion(question);
    const cachedSessionId = get().sessionByQuestionId[question.id];
    const history = useChatHistory.getState();
    const cachedAlive = cachedSessionId
      ? history.sessionsMeta.some((session) => session.id === cachedSessionId)
      : false;
    const sessionId = cachedAlive
      ? cachedSessionId
      : history.createSession(currentChatContext(), "floating");
    if (!cachedAlive) history.updateSessionTitle(sessionId, title);

    const modelId = getQuizExplainModelId();
    const floatingWin: QuizExplainWin = {
      id,
      sessionId,
      modelId,
      questionId: question.id,
      seedText,
      seedNonce: cachedAlive ? 0 : 1,
    };
    const { pos, size } = initialGeometry(get().windows.length);
    useWindowManager.getState().openWindow({
      id,
      type: "quiz-explain",
      title,
      pos,
      size,
      data: { sessionId, modelId, questionId: question.id },
    });
    set((state) => ({
      windows: [...state.windows, floatingWin],
      sessionByQuestionId: { ...state.sessionByQuestionId, [question.id]: sessionId },
    }));
    return id;
  },

  closeWindow: (id) => {
    const sessionId = get().windows.find((win) => win.id === id)?.sessionId ?? null;
    useWindowManager.getState().closeWindow(id);
    set((state) => ({ windows: state.windows.filter((win) => win.id !== id) }));
    if (sessionId) {
      const meta = useChatHistory.getState().sessionsMeta.find((item) => item.id === sessionId);
      const msgs = useChatHistory.getState().messagesById[sessionId];
      const empty = meta && (meta.messageCount === 0 || (msgs && msgs.length === 0));
      if (empty) {
        useChatHistory.getState().deleteSession(sessionId);
        set((state) => {
          const next = { ...state.sessionByQuestionId };
          for (const [questionId, cached] of Object.entries(next)) {
            if (cached === sessionId) delete next[questionId];
          }
          return { sessionByQuestionId: next };
        });
      }
    }
  },

  updateWindow: (id, patch) => {
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id ? { ...win, ...patch } : win)),
    }));
    if (patch.modelId) {
      const current = get().windows.find((win) => win.id === id);
      useWindowManager.getState().updateWindow(id, {
        data: {
          sessionId: current?.sessionId ?? "",
          modelId: patch.modelId,
          questionId: current?.questionId ?? "",
        },
      });
    }
  },
}));

export function persistQuizExplainSize(size: { width: number; height: number }): void {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

export function quizExplainWindowIdOf(questionId: string): string {
  return quizExplainWindowId(questionId);
}
