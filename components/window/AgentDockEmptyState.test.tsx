import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentDockEmptyState from "./AgentDockEmptyState";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

vi.mock("@/components/project/ProjectRequiredDialog", () => ({ default: () => <div role="dialog" aria-label="选择项目">选择项目</div> }));
beforeEach(() => {
  useChatHistory.setState({ sessionsMeta: [], activeSessionId: null, activeProjectId: null });
  useWindowManager.setState({ windows: [], activeWindowId: null });
});
afterEach(cleanup);
describe("Agent dock content entries", () => {
  it("内部教材走已有managed window入口；项目缺失时走同一选择项目流程", () => {
    render(<AgentDockEmptyState />);
    fireEvent.click(screen.getByTestId("agent-dock-empty-textbook"));
    expect(useWindowManager.getState().windows).toEqual(expect.arrayContaining([expect.objectContaining({ id: "internal-textbook", type: "textbook" })]));
    fireEvent.click(screen.getByTestId("agent-dock-empty-project-files"));
    expect(screen.getByRole("dialog", { name: "选择项目" })).toBeInTheDocument();
    expect(useWindowManager.getState().windows.some((window) => window.type === "project-files")).toBe(false);
  });
  it("会话自身的项目归属优先于当前侧栏选择项目", () => {
    useChatHistory.setState({ activeSessionId: "chat-1", activeProjectId: "sidebar-project", sessionsMeta: [{ id: "chat-1", folderId: "session-project", title: "对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }] });
    render(<AgentDockEmptyState />);
    fireEvent.click(screen.getByTestId("agent-dock-empty-project-files"));
    expect(useWindowManager.getState().windows.find((window) => window.type === "project-files")?.data).toEqual({ projectId: "session-project" });
  });
});
