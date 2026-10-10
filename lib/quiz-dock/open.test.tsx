import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUIZ_AUTO_OPEN_STORAGE_KEY,
  QUIZ_DOCK_WINDOW_TYPE,
  openAgentQuiz,
  quizDockWindowId,
  resetAutoOpenedQuizzes,
} from "./open";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import type { QuizQuestion } from "@/lib/quiz/types";

const questions: QuizQuestion[] = [
  {
    id: "q1",
    type: "true_false",
    difficulty: "basic",
    source: "current_chapter",
    points: 1,
    stem: "1+1=2",
    answer: 1,
  },
];

function payload(quizId: string) {
  return { quizId, title: `小测 ${quizId}`, intent: "check", questions, droppedCount: 2 };
}

function windows() {
  return useWindowManager.getState().windows;
}

beforeEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  resetAutoOpenedQuizzes();
});

afterEach(() => resetAutoOpenedQuizzes());

describe("openAgentQuiz", () => {
  it("opens one quiz-dock window carrying the whole quiz payload", () => {
    const id = openAgentQuiz(payload("quiz-1"));

    expect(id).toBe("quiz-dock:quiz-1");
    expect(id).toBe(quizDockWindowId("quiz-1"));
    expect(windows()).toHaveLength(1);
    const [win] = windows();
    expect(win.type).toBe(QUIZ_DOCK_WINDOW_TYPE);
    expect(win.title).toBe("出题 · 小测 quiz-1");
    expect(win.data).toMatchObject({
      quizId: "quiz-1",
      title: "小测 quiz-1",
      intent: "check",
      questions,
      droppedCount: 2,
    });
    expect(win.minimized).toBe(false);
    expect(useWindowManager.getState().activeWindowId).toBe(id);
  });

  it("reuses the same window for the same quizId and restores it to the front", () => {
    const first = openAgentQuiz(payload("quiz-1"));
    useWindowManager.getState().minimizeWindow(first);

    const second = openAgentQuiz({ ...payload("quiz-1"), title: "改名了", droppedCount: 0 });

    expect(second).toBe(first);
    expect(windows()).toHaveLength(1);
    expect(windows()[0].title).toBe("出题 · 改名了");
    expect(windows()[0].minimized).toBe(false);
    expect(windows()[0].data).toMatchObject({ title: "改名了", droppedCount: 0 });
    expect(useWindowManager.getState().activeWindowId).toBe(first);
  });

  it("keeps different quizzes in separate windows", () => {
    openAgentQuiz(payload("quiz-1"));
    openAgentQuiz(payload("quiz-2"));
    expect(windows().map((win) => win.id)).toEqual(["quiz-dock:quiz-1", "quiz-dock:quiz-2"]);
  });

  it("auto-opens one quizId only once per browser session", () => {
    openAgentQuiz(payload("quiz-1"), { auto: true });
    expect(windows()).toHaveLength(1);
    useWindowManager.getState().closeWindow("quiz-dock:quiz-1");

    // 卡片重新挂载（切走再切回这条对话）：不重弹
    openAgentQuiz(payload("quiz-1"), { auto: true });
    expect(windows()).toHaveLength(0);

    // 手动点「在右侧作答」不带 auto：照样能开
    openAgentQuiz(payload("quiz-1"));
    expect(windows().map((win) => win.id)).toEqual(["quiz-dock:quiz-1"]);
  });

  it("seeds the auto-open set from sessionStorage so a refresh never reopens old quizzes", () => {
    window.sessionStorage.setItem(QUIZ_AUTO_OPEN_STORAGE_KEY, JSON.stringify(["quiz-old"]));

    openAgentQuiz(payload("quiz-old"), { auto: true });
    expect(windows()).toHaveLength(0);

    openAgentQuiz(payload("quiz-new"), { auto: true });
    expect(windows().map((win) => win.id)).toEqual(["quiz-dock:quiz-new"]);
    expect(
      JSON.parse(window.sessionStorage.getItem(QUIZ_AUTO_OPEN_STORAGE_KEY) ?? "[]").sort(),
    ).toEqual(["quiz-new", "quiz-old"]);
  });

  it("still opens the window when sessionStorage is denied", () => {
    const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const getSpy = vi.spyOn(proto, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setSpy = vi.spyOn(proto, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      expect(() => openAgentQuiz(payload("quiz-1"), { auto: true })).not.toThrow();
      expect(windows().map((win) => win.id)).toEqual(["quiz-dock:quiz-1"]);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
