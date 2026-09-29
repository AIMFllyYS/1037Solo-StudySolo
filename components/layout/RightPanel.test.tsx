import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "@/lib/stores/ui";
import { useSettings } from "@/lib/hooks/useSettings";
import { useChatHistory } from "@/lib/stores/chatHistory";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="dynamic-tab" />,
}));

vi.mock("@/lib/hooks/useIsClient", () => ({
  useIsClient: () => true,
}));

vi.mock("@/lib/hooks/useBrowser", () => ({
  BROWSE_TAB: "browse",
  useBrowser: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      bookmarks: [],
      activeTabId: "browse",
      openBrowse: () => {},
      openBookmark: () => {},
      removeBookmark: () => {},
    }),
}));

vi.mock("@/components/browser/BrowserSettingsButton", () => ({
  default: () => <button type="button">浏览器设置</button>,
}));

vi.mock("@/components/window/WindowTaskbar", () => ({
  default: ({ host }: { host: string }) => <div data-testid="window-taskbar-host">{host}</div>,
}));

vi.mock("@/lib/hooks/useAcademicYear", () => ({
  useAcademicYear: (sel: (s: { year: string }) => unknown) => sel({ year: "sophomore-1" }),
}));

// ChatHistoryOverlay 拉进 useImageGen / keyboard 栈，测试里用不到它的内部，直接桩掉。
vi.mock("@/components/chat/ChatHistoryOverlay", () => ({
  default: () => <div data-testid="chat-history-overlay" />,
}));

import RightPanel from "./RightPanel";

describe("RightPanel — Studio agent panel (Cursor-like)", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ showRightPanelTabBar: true });
    useStore.setState({
      rightTab: "ai",
      rightTabs: ["ai", "video", "interactive", "browser"],
      layoutProfile: "full",
      centerTab: "notes",
    });
    useChatHistory.setState({
      sessionsMeta: [
        { id: "s1", title: "会话一", createdAt: 1, updatedAt: 2, messageCount: 1, artifactIds: [] },
        { id: "s2", title: "会话二", createdAt: 1, updatedAt: 3, messageCount: 1, artifactIds: [] },
      ] as never,
      activeSessionId: "s2",
    });
  });

  it("Studio 右栏不再出现任何内置媒体 tab 或「AI 助教」标题", () => {
    render(<RightPanel />);
    expect(screen.queryByRole("button", { name: "动画讲解" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "可交互" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "浏览器" })).not.toBeInTheDocument();
    expect(screen.queryByText("AI 助教")).not.toBeInTheDocument();
    expect(screen.queryByText(/助教/)).not.toBeInTheDocument();
  });

  it("渲染 Cursor 式头：最近对话标签条 + 纯图标动作（历史 / 设置 / 收起）", () => {
    render(<RightPanel />);
    expect(screen.getByTestId("right-agent-header")).toBeInTheDocument();
    const tabs = screen.getAllByTestId("recent-chat-tab");
    expect(tabs.length).toBe(2);
    expect(screen.getByRole("button", { name: "历史记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起右侧面板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启新对话" })).toBeInTheDocument();
  });

  it("点最近对话标签切会话", async () => {
    const switchSpy = vi.fn();
    useChatHistory.setState({ switchSession: switchSpy } as never);
    render(<RightPanel />);
    await userEvent.click(screen.getByRole("button", { name: "会话一" }));
    expect(switchSpy).toHaveBeenCalledWith("s1");
  });

  it("点历史按钮打开历史面板", async () => {
    render(<RightPanel />);
    expect(screen.queryByTestId("chat-history-overlay")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    expect(screen.getByTestId("chat-history-overlay")).toBeInTheDocument();
  });

  it("收起按钮：传入 onCollapse 时以它为准，否则收起当前档位", async () => {
    const onCollapse = vi.fn();
    render(<RightPanel onCollapse={onCollapse} />);
    await userEvent.click(screen.getByRole("button", { name: "收起右侧面板" }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

describe("RightPanel — Agent dock (unchanged)", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ showRightPanelTabBar: true });
    useStore.setState({
      rightTab: "ai",
      rightTabs: ["ai", "video", "interactive", "browser"],
      layoutProfile: "full",
    });
  });

  it("Agent 右栏没有任何内置栏目，只留窗口坞和收起按钮", () => {
    render(<RightPanel hideBuiltinTabs showWindowDock />);
    expect(screen.queryByRole("button", { name: "AI 对话" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "动画讲解" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "可交互" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "浏览器" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "浏览器设置" })).not.toBeInTheDocument();
    expect(screen.getByTestId("window-taskbar-host")).toHaveTextContent("right-panel");
    expect(screen.getByRole("button", { name: "收起右侧面板" })).toBeInTheDocument();
  });
});
