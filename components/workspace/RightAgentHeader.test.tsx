import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { useAgentTabs } from "@/lib/stores/agentTabs";

vi.mock("@/components/chat/ChatHistoryOverlay", () => ({
  default: () => <div data-testid="chat-history-overlay" />,
}));

import RightAgentHeader from "./RightAgentHeader";

const metas = [
  { id: "s1", title: "会话一", createdAt: 1, updatedAt: 2, messageCount: 1, artifactIds: [] },
  { id: "s2", title: "会话二", createdAt: 1, updatedAt: 3, messageCount: 1, artifactIds: [] },
  { id: "s3", title: "会话三", createdAt: 1, updatedAt: 4, messageCount: 1, artifactIds: [] },
];

function tabTitles(): string[] {
  return screen.getAllByTestId("recent-chat-tab").map((tab) => within(tab).getAllByRole("button")[0].textContent ?? "");
}

describe("RightAgentHeader — 关闭标签只隐藏，不删除", () => {
  const deleteSession = vi.fn();
  const switchSession = vi.fn((id: string) => useChatHistory.setState({ activeSessionId: id }));

  beforeEach(() => {
    localStorage.clear();
    deleteSession.mockClear();
    switchSession.mockClear();
    useAgentTabs.setState({ closedIds: [] });
    useChatHistory.setState({
      sessionsMeta: metas as never,
      activeSessionId: "s3",
      deleteSession,
      switchSession,
    } as never);
  });

  it("叉掉非当前标签：标签消失，对话不被删除", async () => {
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "关闭 会话一" }));
    expect(tabTitles()).toEqual(["会话三", "会话二"]);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(3);
    expect(useAgentTabs.getState().closedIds).toEqual(["s1"]);
  });

  it("叉掉当前标签：切到相邻标签，仍不删除", async () => {
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "关闭 会话三" }));
    expect(switchSession).toHaveBeenCalledWith("s2");
    expect(deleteSession).not.toHaveBeenCalled();
    expect(tabTitles()).toEqual(["会话二", "会话一"]);
  });

  it("从历史重新切回已关闭的对话：自动回到标签条", async () => {
    useAgentTabs.setState({ closedIds: ["s1"] });
    const view = render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    expect(tabTitles()).not.toContain("会话一");
    useChatHistory.setState({ activeSessionId: "s1" });
    view.rerender(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    expect(tabTitles()).toContain("会话一");
    expect(useAgentTabs.getState().closedIds).toEqual([]);
  });
});
