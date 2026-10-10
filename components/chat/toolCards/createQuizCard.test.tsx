import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import CreateQuizResultCard from "./createQuizCard";
import { useAppMode } from "@/lib/stores/appMode";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { resetAutoOpenedQuizzes } from "@/lib/quiz-dock/open";
import type { ChatMessage } from "@/lib/types/chat";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";
import type { QuizQuestion } from "@/lib/quiz/types";
import type { ReviewQuizSet } from "@/lib/review-mode/attemptTypes";
import { useToast } from "@/lib/stores/toast";

const f = vi.hoisted(() => ({ legacy: vi.fn(), ownerEpoch: 0 }));
vi.mock("@/lib/review-mode/agentQuizProgress", async (load) => {
  const actual = await load<typeof import('@/lib/review-mode/agentQuizProgress')>();
  return { ...actual, agentQuizSet: (...args: Parameters<typeof actual.agentQuizSet>) => args[2] === "legacy" ? f.legacy(...args) : actual.agentQuizSet(...args) };
});
vi.mock("@/lib/storage/ownerScope", async (load) => ({ ...await load<typeof import('@/lib/storage/ownerScope')>(), getOwnerEpoch: () => f.ownerEpoch }));

vi.mock("@/components/quiz/QuizQuestion", () => ({
  default: ({ question }: { question: QuizQuestion }) => <div>{question.stem}</div>,
}));

const message = { id: "m", role: "assistant", timestamp: 1, parts: [] } as ChatMessage;

function quizPart(): ToolPart<"createQuiz"> {
  return {
    type: "tool-createQuiz",
    toolCallId: "c1",
    state: "output-available",
    input: { title: "即时检验", questions: [] },
    output: {
      text: "…",
      quizId: "quiz_1",
      title: "即时检验",
      intent: "check",
      droppedCount: 0,
      questions: [{
        id: "q1",
        type: "single_choice",
        difficulty: "basic",
        source: "current_chapter",
        points: 2,
        stem: "第一题",
        options: ["甲", "乙"],
        answer: 0,
      }],
    },
  } as ToolPart<"createQuiz">;
}

function renderCard() {
  render(<CreateQuizResultCard part={quizPart()} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
}

function windows() {
  return useWindowManager.getState().windows;
}

beforeEach(() => {
  f.ownerEpoch = 0;
  f.legacy.mockReset();
  useToast.getState().clear();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  resetAutoOpenedQuizzes();
  useAppMode.setState({ mode: "studio" });
});

afterEach(() => {
  cleanup();
  useToast.getState().clear();
  useAppMode.setState({ mode: "studio" });
});

describe("createQuiz ResultCard", () => {
  it("renders quiz fold title", () => {
    renderCard();
    expect(screen.getByText(/即时检验 · 1 题/)).toBeVisible();
    expect(windows()).toHaveLength(0);
  });

  it("hides the chat notice and auto-opens the right dock on the Agent surface", () => {
    useAppMode.setState({ mode: "agent" });
    renderCard();

    expect(screen.queryByTestId("chat-quiz-agent-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-quiz-card")).not.toBeInTheDocument();

    const [win] = windows();
    expect(win.type).toBe("quiz-dock");
    expect(win.id).toBe("quiz-dock:quiz_1");
    expect(win.data).toMatchObject({ quizId: "quiz_1", title: "即时检验", intent: "check" });
  });

  it("does not auto-open the same quiz again when the card remounts", () => {
    useAppMode.setState({ mode: "agent" });
    renderCard();
    useWindowManager.getState().closeWindow("quiz-dock:quiz_1");
    cleanup();

    renderCard();
    expect(screen.queryByTestId("chat-quiz-card")).not.toBeInTheDocument();
    expect(windows()).toHaveLength(0);
  });

  it("does not open a delayed legacy quiz after the owner epoch changes", async () => {
    useAppMode.setState({ mode: "agent" });
    let finish: ((set: ReviewQuizSet) => void) | undefined;
    f.legacy.mockImplementation(() => new Promise<ReviewQuizSet>((resolve) => { finish = resolve; }));
    const part = quizPart();
    if (part.state !== "output-available") throw new Error("test output required");
    part.output.quizId = "";
    render(<CreateQuizResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(f.legacy).toHaveBeenCalledOnce();
    await act(async () => {
      f.ownerEpoch += 1;
      finish!({ quizId: `legacy:${"a".repeat(64)}` } as ReviewQuizSet);
    });
    expect(windows()).toHaveLength(0);
    expect(useToast.getState().toasts).toHaveLength(0);
  });

  it("handles a legacy hash rejection with the existing toast and no quiz window", async () => {
    useAppMode.setState({ mode: "agent" });
    f.legacy.mockRejectedValue(new Error("REVIEW_HASH_UNAVAILABLE"));
    const part = quizPart();
    if (part.state !== "output-available") throw new Error("test output required");
    part.output.quizId = "";
    render(<CreateQuizResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    await waitFor(() => expect(useToast.getState().toasts).toHaveLength(1));
    expect(useToast.getState().toasts[0].message).toContain("出题失败");
    expect(windows()).toHaveLength(0);
  });
});
