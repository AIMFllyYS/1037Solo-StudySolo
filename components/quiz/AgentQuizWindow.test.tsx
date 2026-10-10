import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AgentQuizWindowLayer from "./AgentQuizWindow";
import { openAgentQuiz, resetAutoOpenedQuizzes } from "@/lib/quiz-dock/open";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import type { QuizQuestion } from "@/lib/quiz/types";

vi.mock("@/components/quiz/QuizQuestion", () => ({
  default: ({ question }: { question: QuizQuestion }) => (
    <div data-testid="quiz-question">{question.stem}</div>
  ),
}));

function question(id: string, stem: string): QuizQuestion {
  return {
    id,
    type: "true_false",
    difficulty: "basic",
    source: "current_chapter",
    points: 1,
    stem,
    answer: 1,
  };
}

beforeEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  resetAutoOpenedQuizzes();
});

afterEach(() => cleanup());

describe("AgentQuizWindowLayer", () => {
  it("renders nothing when there is no quiz-dock window", () => {
    render(<AgentQuizWindowLayer />);
    expect(screen.queryByTestId("agent-quiz-window")).not.toBeInTheDocument();
  });

  it("renders one window per quiz with the shared QuizRunner inside", () => {
    openAgentQuiz({
      quizId: "quiz-1",
      title: "小测一",
      intent: "check",
      questions: [question("q1", "第一题")],
      droppedCount: 1,
    });
    openAgentQuiz({
      quizId: "quiz-2",
      title: "小测二",
      intent: "practice",
      questions: [question("q2", "第二题")],
    });

    render(<AgentQuizWindowLayer />);

    expect(screen.getAllByTestId("agent-quiz-window")).toHaveLength(2);
    expect(screen.getByText("出题 · 小测一")).toBeVisible();
    expect(screen.getByText("出题 · 小测二")).toBeVisible();
    expect(screen.getAllByTestId("quiz-runner")).toHaveLength(2);
    expect(screen.getByText("第一题")).toBeVisible();
    expect(screen.getByText("第二题")).toBeVisible();
    expect(screen.getByText(/有 1 道题因结构不完整被丢弃/)).toBeVisible();
  });

  it("skips a quiz-dock window whose data is missing", () => {
    useWindowManager.getState().openWindow({
      id: "quiz-dock:broken",
      type: "quiz-dock",
      title: "出题",
      pos: { x: 0, y: 0 },
      size: { width: 400, height: 400 },
      data: {},
    });

    render(<AgentQuizWindowLayer />);
    expect(screen.queryByTestId("agent-quiz-window")).not.toBeInTheDocument();
  });
});
