import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AgentDockHost from "./AgentDockHost";
import { useAppMode } from "@/lib/stores/appMode";
import { useStore } from "@/lib/stores/ui";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

function reset() {
  cleanup();
  useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: true });
  useStore.setState({
    layoutProfile: "full",
    rightCollapsedByProfile: { full: false, article: true, reference: false },
    agentDockCollapsed: false,
  });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useAgentDockRuntime.setState({ contentHost: null, openRequest: 0, dockGlobal: false });
}

afterEach(reset);

describe("AgentDockHost", () => {
  it("does not undo an intentional collapse when existing windows are present", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    useStore.setState({ agentDockCollapsed: true });
    useWindowManager.getState().openWindow({
      id: "existing-window",
      type: "source-preview",
      title: "已有窗口",
      pos: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      data: { url: "https://example.com", title: "已有窗口" },
    });
    render(<AgentDockHost><div>内容</div></AgentDockHost>);

    await waitFor(() => expect(useStore.getState().agentDockCollapsed).toBe(true));
  });

  it("expands a collapsed dock when new content asks for it, even without managed windows", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    useStore.setState({ agentDockCollapsed: true });
    render(<AgentDockHost><div>内容</div></AgentDockHost>);

    act(() => useAgentDockRuntime.getState().requestOpen());

    await waitFor(() => expect(useStore.getState().agentDockCollapsed).toBe(false));
  });

  it("hands the active slot back to the top window when the active one is gone", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    useWindowManager.getState().openWindow({
      id: "low",
      type: "source-preview",
      title: "低层",
      pos: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      data: { url: "https://example.com", title: "低层" },
    });
    useWindowManager.getState().openWindow({
      id: "high",
      type: "source-preview",
      title: "高层",
      pos: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      data: { url: "https://example.com", title: "高层" },
    });
    useWindowManager.setState({ activeWindowId: null });
    render(<AgentDockHost><div>内容</div></AgentDockHost>);

    await waitFor(() => expect(useWindowManager.getState().activeWindowId).toBe("high"));
  });
});
