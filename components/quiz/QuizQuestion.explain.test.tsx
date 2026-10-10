import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QuizQuestion from "./QuizQuestion";
import { useQuizExplain } from "@/lib/stores/learning/quizExplain";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import type { QuizQuestion as Q } from "@/lib/quiz/types";

const question: Q = {
  id: "explain-q",
  type: "true_false",
  difficulty: "basic",
  source: "current_chapter",
  points: 1,
  stem: "1+1=2",
  answer: 1,
  explanation: "深度解析正文",
};

function reset() {
  useQuizExplain.setState({ windows: [], sessionByQuestionId: {} });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useChatHistory.setState({
    sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    messagesById: { main: [] },
    activeSessionId: "main",
    sessionLoadState: { main: "loaded" },
    loadedSessionIds: ["main"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });
}

beforeEach(() => reset());
afterEach(() => cleanup());

describe("QuizQuestion 深度解析卡片", () => {
  it("review 模式卡片贴题干更近，右上角可开 Agent 窗", () => {
    render(
      <QuizQuestion
        question={question}
        index={0}
        total={1}
        mode="review"
        answer={1}
        result={{ question, answer: 1, awarded: 1, max: 1, correct: true, objective: true, selfScored: false }}
      />,
    );
    const card = screen.getByTestId("quiz-explain-card");
    expect(card).toHaveStyle({ marginTop: "6px" });
    expect(screen.getByRole("button", { name: "让 Agent 更详细解答" })).toBeVisible();
    expect(screen.getByText("深度解析正文")).toBeVisible();
    fireEvent.click(screen.getByTestId("quiz-explain-agent-btn"));
    const win = useQuizExplain.getState().windows[0];
    expect(win.questionId).toBe("explain-q");
    expect(win.modelId).toBe(DEFAULT_MODEL_ID);
    expect(win.seedText).toContain("1+1=2");
    expect(win.seedText).toContain("深度解析正文");
    expect(useWindowManager.getState().windows[0]?.type).toBe("quiz-explain");
    expect(useChatHistory.getState().activeSessionId).toBe("main");
  });

  it("答题模式不展示深度解析卡片", () => {
    render(
      <QuizQuestion question={question} index={0} total={1} mode="answer" answer={null} />,
    );
    expect(screen.queryByTestId("quiz-explain-card")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "让 Agent 更详细解答" })).not.toBeInTheDocument();
  });
});
