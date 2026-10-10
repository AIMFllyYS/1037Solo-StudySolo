import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import AgentDockTabs from "./AgentDockTabs";

vi.mock("@/lib/hooks/runtime/useUiReducedMotion", () => ({ useUiReducedMotion: () => false }));

function makeWindow(id: string, z: number): ManagedWindow {
  return {
    id,
    type: "source-preview",
    title: `资源 ${id}`,
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    z,
    fullscreen: false,
    minimized: false,
    sessionId: "session-a",
    data: { url: `https://example.test/${id}`, title: `资源 ${id}` },
  };
}

function TestDockTabs() {
  const windows = useWindowManager((state) => state.windows);
  return <AgentDockTabs windows={windows} addContent={<button data-testid="dock-add-content">添加内容</button>} />;
}

function visibleTitles(): string[] {
  return within(screen.getByRole("tablist")).getAllByRole("tab").map((tab) => tab.getAttribute("title") ?? "");
}

describe("AgentDockTabs", () => {
  beforeEach(() => {
    localStorage.clear();
    useWindowManager.setState({
      windows: [makeWindow("w1", 1), makeWindow("w2", 2), makeWindow("w3", 3), makeWindow("w4", 4), makeWindow("w5", 5)],
      topZ: 5,
      activeWindowId: "w5",
    });
    useChatHistory.setState({
      sessionsMeta: [{ id: "session-a", title: "A", createdAt: 1, updatedAt: 1, messageCount: 1, artifactIds: ["kept-asset"] }],
    } as never);
  });

  it("shows only the three most recently used tabs and keeps Add Content at the left edge", () => {
    render(<TestDockTabs />);
    const tablist = screen.getByRole("tablist");
    expect(tablist.parentElement?.firstElementChild).toBe(screen.getByTestId("dock-add-content"));
    expect(visibleTitles()).toEqual(["资源 w5", "资源 w4", "资源 w3"]);
    expect(screen.getAllByTestId("agent-dock-tab").map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByTestId("agent-dock-overflow-trigger")).toHaveTextContent("+2");
    expect(useWindowManager.getState().windows).toHaveLength(5);
  });

  it("defaults the roving tab stop and preserves Arrow/Home/End focus movement", async () => {
    useWindowManager.setState({ activeWindowId: null });
    render(<TestDockTabs />);
    const initialTabs = screen.getAllByTestId("agent-dock-tab");
    expect(initialTabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(initialTabs[0], { key: "ArrowRight" });
    await waitFor(() => expect(useWindowManager.getState().activeWindowId).toBe("w4"));
    await waitFor(() => expect(screen.getByTitle("资源 w4")).toHaveFocus());
    expect(screen.getAllByTestId("agent-dock-tab").map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(screen.getByTitle("资源 w4"), { key: "End" });
    await waitFor(() => expect(useWindowManager.getState().activeWindowId).toBe("w3"));
    await waitFor(() => expect(screen.getByTitle("资源 w3")).toHaveFocus());

    fireEvent.keyDown(screen.getByTitle("资源 w5"), { key: "Home" });
    await waitFor(() => expect(screen.getByTitle("资源 w3")).toHaveFocus());

    fireEvent.keyDown(screen.getByTitle("资源 w3"), { key: "ArrowLeft" });
    await waitFor(() => expect(useWindowManager.getState().activeWindowId).toBe("w5"));
    await waitFor(() => expect(screen.getByTitle("资源 w5")).toHaveFocus());
    expect(screen.getAllByTestId("agent-dock-tab").map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("restores a window selected from overflow without dropping the other windows", async () => {
    const user = userEvent.setup();
    useWindowManager.setState((state) => ({
      windows: state.windows.map((window) => window.id === "w2" ? { ...window, minimized: true } : window),
    }));
    render(<TestDockTabs />);
    await user.click(screen.getByTestId("agent-dock-overflow-trigger"));
    await user.click(await screen.findByTestId("agent-dock-overflow-item-w2"));

    await waitFor(() => expect(useWindowManager.getState().activeWindowId).toBe("w2"));
    expect(useWindowManager.getState().windows.find((window) => window.id === "w2")?.minimized).toBe(false);
    expect(visibleTitles()[0]).toBe("资源 w2");
    expect(useWindowManager.getState().windows).toHaveLength(5);
  });

  it("closes one window without disturbing the remaining resource windows", async () => {
    const user = userEvent.setup();
    render(<TestDockTabs />);
    await user.click(screen.getByTestId("agent-dock-tab-menu-w5"));
    await user.click(await screen.findByTestId("agent-dock-menu-close-tab"));

    await waitFor(() => expect(useWindowManager.getState().windows.map((window) => window.id)).toEqual(["w1", "w2", "w3", "w4"]));
    expect(useWindowManager.getState().activeWindowId).toBe("w4");
    expect(useChatHistory.getState().sessionsMeta[0]?.artifactIds).toEqual(["kept-asset"]);
  });

  it("closes only the requested window set and leaves the conversation and its asset IDs intact", async () => {
    const user = userEvent.setup();
    render(<TestDockTabs />);
    await user.click(screen.getByTestId("agent-dock-tab-menu-w5"));
    await user.click(await screen.findByTestId("agent-dock-menu-close-others"));

    await waitFor(() => expect(useWindowManager.getState().windows.map((window) => window.id)).toEqual(["w5"]));
    expect(useChatHistory.getState().sessionsMeta[0]?.artifactIds).toEqual(["kept-asset"]);
    await waitFor(() => expect(visibleTitles()).toEqual(["资源 w5"]));
  });

  it("supports Escape and returns focus to the tab action button", async () => {
    render(<TestDockTabs />);
    const trigger = screen.getByTestId("agent-dock-tab-menu-w5");
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("agent-dock-tab-menu");
    fireEvent.keyDown(menu, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("agent-dock-tab-menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes all resource windows while leaving the conversation history untouched", async () => {
    const user = userEvent.setup();
    render(<TestDockTabs />);
    await user.click(screen.getByTestId("agent-dock-tab-menu-w5"));
    await user.click(await screen.findByTestId("agent-dock-menu-close-all"));

    await waitFor(() => expect(useWindowManager.getState().windows).toEqual([]));
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(1);
    expect(useChatHistory.getState().sessionsMeta[0]?.artifactIds).toEqual(["kept-asset"]);
  });
});
