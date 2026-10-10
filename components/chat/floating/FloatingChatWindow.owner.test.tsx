import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { activateStorageOwner, getStorageOwner } from "@/lib/storage/ownerScope";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { useFloatingChats, type FloatingWin } from "@/lib/stores/floatingChats";
import { useFloatingTokenTracker } from "@/lib/hooks/useFloatingTokenTracker";
import { useWindowManager } from "@/lib/stores/windowManager";

const authState = vi.hoisted(() => ({ status: "signedIn" as "loading" | "signedOut" | "signedIn", userId: "new-owner" as string | null }));

vi.mock("@/lib/hooks/useAuthSession", () => ({ useAuthSession: () => authState }));
vi.mock("@/lib/window/useManagedWindowSurface", () => ({ useIsAgentSurface: () => false }));
vi.mock("@/components/window/ManagedWindow", () => ({
  default: ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
    <section><h1 data-testid="floating-window-title">{title}</h1>{children}<button onClick={onClose}>Close window</button></section>
  ),
}));
vi.mock("@/components/chat/floating/FloatingChatBody", () => ({ default: () => <div /> }));

import FloatingChatWindow from "./FloatingChatWindow";

const staleWindow: FloatingWin = {
  id: "floating-window",
  sessionId: "same-session-id",
  ownerId: "old-owner",
  ownerEpoch: 1,
  modelId: "test-model",
  seedText: "private selection from the old account",
  seedMode: "ask",
  seedNonce: 0,
};

describe("FloatingChatWindow owner boundary", () => {
  let previousOwner: string | null = null;

  beforeEach(() => {
    previousOwner = getStorageOwner();
    activateStorageOwner("new-owner");
    authState.status = "signedIn";
    authState.userId = "new-owner";
    useWindowManager.setState({
      windows: [{
        id: staleWindow.id,
        type: "floating-chat",
        title: "private old title",
        pos: { x: 12, y: 12 },
        size: { width: 420, height: 480 },
        z: 5001,
        minimized: false,
        fullscreen: false,
        data: { sessionId: staleWindow.sessionId, modelId: staleWindow.modelId },
      }] as never,
      topZ: 5001,
      activeWindowId: staleWindow.id,
    });
    useFloatingChats.setState({ windows: [staleWindow] });
    useChatHistory.setState({
      activeSessionId: staleWindow.sessionId,
      messagesById: { [staleWindow.sessionId]: [] },
      sessionsMeta: [{ id: staleWindow.sessionId, title: "private new title", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    });
  });

  afterEach(() => {
    cleanup();
    activateStorageOwner(previousOwner);
    useFloatingChats.setState({ windows: [] });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  it("hides stale titles and closes a stale window without resetting or deleting current-owner state", () => {
    const resetTokens = vi.spyOn(useFloatingTokenTracker.getState(), "resetSession");
    render(<FloatingChatWindow win={staleWindow} />);
    expect(screen.getByTestId("floating-window-title")).toHaveTextContent("账号已切换");
    expect(screen.queryByText(/private (old|new) title|private selection/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(resetTokens).not.toHaveBeenCalled();
    expect(useChatHistory.getState().sessionsMeta.some((session) => session.id === staleWindow.sessionId)).toBe(true);
  });
});
