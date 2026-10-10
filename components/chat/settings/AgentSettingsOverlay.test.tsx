import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentSettingsOverlay from "./AgentSettingsOverlay";
import { useStore } from "@/lib/stores/ui";

let mobile = false;

vi.mock("@/lib/hooks/useIsMobile", () => ({
  useIsMobile: () => mobile,
}));

vi.mock("@/components/chat/ChatSettings", () => ({
  default: ({ onClose, navPlacement }: { onClose?: () => void; navPlacement?: string }) => (
    <div data-testid="chat-settings-workspace" data-nav={navPlacement ?? "side"}>
      <button type="button" onClick={onClose}>返回对话</button>
    </div>
  ),
}));

describe("AgentSettingsOverlay", () => {
  beforeEach(() => {
    mobile = false;
    useStore.setState({ agentSettingsOpen: false });
  });

  afterEach(() => {
    cleanup();
    useStore.setState({ agentSettingsOpen: false });
  });

  it("stays closed until the shared store opens it", () => {
    render(<AgentSettingsOverlay />);
    expect(screen.queryByTestId("agent-settings-overlay")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Agent 设置" })).toBeNull();
  });

  it("renders the existing ChatSettings workspace in a centered dialog", () => {
    useStore.setState({ agentSettingsOpen: true });
    render(<AgentSettingsOverlay />);
    const dialog = screen.getByRole("dialog", { name: "Agent 设置" });
    expect(dialog).toHaveClass("agent-settings-dialog");
    expect(screen.getByTestId("chat-settings-workspace")).toBeInTheDocument();
    expect(dialog.closest("[data-testid=agent-settings-overlay]")).toHaveClass("agent-settings-overlay");
  });

  it("closes from the reused workspace back control", async () => {
    useStore.setState({ agentSettingsOpen: true });
    render(<AgentSettingsOverlay />);
    fireEvent.click(screen.getByRole("button", { name: "返回对话" }));
    expect(useStore.getState().agentSettingsOpen).toBe(false);
    // 退场动画由 AnimatePresence 托管：store 已关，节点再播一帧 exit 才卸载。
    await waitForElementToBeRemoved(() => screen.queryByTestId("agent-settings-overlay"));
  });

  it("closes when clicking the dimmed backdrop", () => {
    useStore.setState({ agentSettingsOpen: true });
    render(<AgentSettingsOverlay />);
    fireEvent.mouseDown(screen.getByTestId("agent-settings-overlay"));
    expect(useStore.getState().agentSettingsOpen).toBe(false);
  });

  it("goes fullscreen with top tabs on the phone", () => {
    mobile = true;
    useStore.setState({ agentSettingsOpen: true });
    render(<AgentSettingsOverlay />);
    expect(screen.getByTestId("agent-settings-overlay")).toHaveAttribute("data-layout", "mobile");
    expect(screen.getByRole("dialog", { name: "Agent 设置" })).toHaveClass("agent-settings-dialog--mobile");
    expect(screen.getByTestId("chat-settings-workspace")).toHaveAttribute("data-nav", "top");
  });
});
