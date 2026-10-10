import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useChatHistory } from "../../stores/chat/chatHistory";
import { useChatReady } from "./useChatReady";

function Probe({ sessionId }: { sessionId?: string }) {
  return <div>{useChatReady(sessionId) ? "ready" : "not-ready"}</div>;
}

beforeEach(() => {
  useChatHistory.setState({
    sessionsMeta: [],
    messagesById: {},
    activeSessionId: null,
    sessionLoadState: {},
    loadedSessionIds: [],
    pinnedSessionIds: [],
    _hasHydrated: false,
    _activeMessagesReady: false,
  });
});

describe("useChatReady", () => {
  it("uses active session readiness by default", () => {
    useChatHistory.setState({
      activeSessionId: "s1",
      messagesById: { s1: [] },
      sessionLoadState: { s1: "loaded" },
      _hasHydrated: true,
      _activeMessagesReady: true,
    });

    render(<Probe />);

    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("uses the requested session readiness for floating windows", () => {
    useChatHistory.setState({
      activeSessionId: "s1",
      messagesById: { s1: [] },
      sessionLoadState: { s1: "loaded", s2: "loading" },
      _hasHydrated: true,
      _activeMessagesReady: true,
    });

    render(<Probe sessionId="s2" />);

    expect(screen.getByText("not-ready")).toBeTruthy();
  });
});
