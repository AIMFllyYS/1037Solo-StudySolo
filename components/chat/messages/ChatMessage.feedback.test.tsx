import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ChatMessage as ChatMessageType } from "@/lib/types/chat";
import ChatMessage from "./ChatMessage";

vi.mock("@/lib/stores/workspace/contextMenu", () => ({ openMessageMenu: vi.fn() }));

function assistantMessage(): ChatMessageType {
  return {
    id: "assistant-message-1",
    role: "assistant",
    parts: [{ type: "text", text: "A short assistant answer." }],
    timestamp: 1,
  };
}

afterEach(cleanup);

describe("ChatMessage feedback actions", () => {
  it("places actions below a completed answer when a session is available", () => {
    render(<ChatMessage message={assistantMessage()} onFollowUpSelect={vi.fn()} sessionId="session-1" />);
    const answer = screen.getByTestId("chat-feedback-assistant-message-1");
    expect(answer).toBeVisible();
    expect(screen.getByRole("button", { name: "复制回答" })).toBeInTheDocument();
    expect(screen.getByText("A short assistant answer.")).toBeInTheDocument();
  });

  it("hides feedback actions for a streaming answer", () => {
    render(<ChatMessage message={assistantMessage()} onFollowUpSelect={vi.fn()} sessionId="session-1" isStreaming />);
    expect(screen.queryByTestId("chat-feedback-assistant-message-1")).toBeNull();
  });
});
