import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileMiniChat from "./MobileMiniChat";
import { useStore } from "@/lib/stores/ui";

vi.mock("@/lib/hooks/chat/useChat", () => ({
  useChat: () => ({
    messages: [],
    isLoading: false,
    error: null,
    info: null,
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    clearError: vi.fn(),
    clearInfo: vi.fn(),
    sessionId: "s1",
  }),
}));

vi.mock("@/lib/stores/chat/chatHistory", () => ({
  useChatHistory: (sel: (s: { activeSessionId: string }) => unknown) => sel({ activeSessionId: "s1" }),
  ensureChatHistoryBootstrap: () => Promise.resolve(),
}));

vi.mock("@/lib/hooks/chat/useChatReady", () => ({
  useChatReady: () => true,
}));

vi.mock("@/components/chat/ChatThread", () => ({
  default: () => <div data-testid="mini-chat-thread">thread</div>,
}));

vi.mock("@/components/chat/composer/ChatInput", () => ({
  default: () => <div data-testid="mini-chat-input">input</div>,
}));

const context = {
  subjectId: "histology",
  categoryId: "detail",
  itemId: "1.1",
  currentTopic: "histology detail 1.1",
  academicYear: "sophomore-1",
};

describe("MobileMiniChat", () => {
  beforeEach(() => {
    useStore.setState({ mobileTab: "detail", mobileMiniChatOpen: false });
  });
  afterEach(cleanup);

  it("hides on AI and settings tabs", () => {
    act(() => {
      useStore.setState({ mobileTab: "ai" });
    });
    const { rerender } = render(<MobileMiniChat chatContext={context} />);
    expect(screen.queryByTestId("mobile-mini-chat-fab")).not.toBeInTheDocument();
    act(() => {
      useStore.setState({ mobileTab: "settings" });
    });
    rerender(<MobileMiniChat chatContext={context} />);
    expect(screen.queryByTestId("mobile-mini-chat-fab")).not.toBeInTheDocument();
  });

  it("opens a custom overlay instead of a managed window", () => {
    render(<MobileMiniChat chatContext={context} />);
    fireEvent.click(screen.getByTestId("mobile-mini-chat-fab"));
    expect(useStore.getState().mobileMiniChatOpen).toBe(true);
    expect(screen.getByTestId("mobile-mini-chat")).toBeInTheDocument();
    expect(screen.getByTestId("mini-chat-thread")).toBeInTheDocument();
    expect(screen.getByTestId("mini-chat-input")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(useStore.getState().mobileMiniChatOpen).toBe(false);
  });
});
