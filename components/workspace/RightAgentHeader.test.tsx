import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useAgentTabs } from "@/lib/stores/workspace/agentTabs";
import { activateStorageOwner } from "@/lib/storage/ownerScope";

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
    activateStorageOwner(null);
    activateStorageOwner("header-owner");
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
  afterEach(() => { cleanup(); activateStorageOwner(null); });

  it("叉掉非当前标签：标签消失，对话不被删除", async () => {
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "关闭 会话一" }));
    // 标签以 popLayout 退场动画离开：等动画结束后再断言。
    await waitFor(() => expect(tabTitles()).toEqual(["会话三", "会话二"]));
    expect(deleteSession).not.toHaveBeenCalled();
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(3);
    expect(useAgentTabs.getState().closedIds).toEqual(["s1"]);
  });

  it("叉掉当前标签：切到相邻标签，仍不删除", async () => {
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "关闭 会话三" }));
    expect(switchSession).toHaveBeenCalledWith("s2");
    expect(deleteSession).not.toHaveBeenCalled();
    await waitFor(() => expect(tabTitles()).toEqual(["会话二", "会话一"]));
  });

  it("从历史重新切回已关闭的对话：自动回到标签条", async () => {
    useAgentTabs.getState().closeTab("s1");
    const view = render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    expect(tabTitles()).not.toContain("会话一");
    act(() => { useChatHistory.setState({ activeSessionId: "s1" }); });
    view.rerender(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    expect(tabTitles()).toContain("会话一");
    expect(useAgentTabs.getState().closedIds).toEqual([]);
  });

  it("默认最近5条，关闭不补旧历史；从历史激活旧会话仍包含于5条", async () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ ...metas[0], id: `recent-${i}`, title: `最近${i}`, updatedAt: 100 - i }));
    useChatHistory.setState({ sessionsMeta: history, activeSessionId: "recent-0" });
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    expect(tabTitles()).toEqual(["最近0", "最近1", "最近2", "最近3", "最近4"]);
    expect(screen.getByTestId("recent-chat-tabs").contains(screen.getByTestId("right-agent-new-chat"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "关闭 最近4" }));
    await waitFor(() => expect(tabTitles()).toEqual(["最近0", "最近1", "最近2", "最近3"]));
    act(() => { useChatHistory.setState({ activeSessionId: "recent-7" }); });
    await waitFor(() => expect(tabTitles()).toContain("最近7"));
    expect(tabTitles()).toHaveLength(5);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("右键关闭其他保留目标，关闭全部进入空白对话，历史不删", async () => {
    const startNewChat = vi.fn(() => { useChatHistory.setState({ activeSessionId: "blank", sessionsMeta: [{ ...metas[0], id: "blank", title: "新对话", messageCount: 0, updatedAt: 10 }, ...metas] }); return "blank"; });
    useChatHistory.setState({ startNewChat });
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    fireEvent.contextMenu(screen.getAllByTestId("recent-chat-tab")[1]);
    await userEvent.click(screen.getByRole("menuitem", { name: "关闭其他标签" }));
    await waitFor(() => expect(tabTitles()).toEqual(["会话二"]));
    fireEvent.contextMenu(screen.getAllByTestId("recent-chat-tab")[0]);
    await userEvent.click(screen.getByRole("menuitem", { name: "关闭全部标签" }));
    await waitFor(() => expect(tabTitles()).toEqual(["新对话"]));
    expect(startNewChat).toHaveBeenCalled();
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(4);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("账号切换关闭已打开菜单", () => {
    render(<RightAgentHeader chatContext={{} as never} onOpenSettings={() => {}} onCollapse={() => {}} />);
    fireEvent.contextMenu(screen.getAllByTestId("recent-chat-tab")[0]);
    expect(screen.getByTestId("right-agent-tab-menu")).toBeInTheDocument();
    act(() => activateStorageOwner("other-owner"));
    expect(screen.queryByTestId("right-agent-tab-menu")).toBeNull();
    expect(useAgentTabs.getState().closedIds).toEqual([]);
  });
});
