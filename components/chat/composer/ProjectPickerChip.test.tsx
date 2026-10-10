import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const historyState = {
  folders: [
    { id: "project-note", name: "笔记记录", createdAt: 0, system: "note" as const },
    { id: "project-floating", name: "划词摘录", createdAt: 0, system: "floating" as const },
    { id: "folder-a", name: "组胚", createdAt: 5, updatedAt: 5 },
  ],
  sessionsMeta: [
    { id: "s1", title: "上皮复习", kind: "main", updatedAt: 100, messageCount: 3, artifactIds: [], folderId: "folder-a" },
    { id: "s2", title: "游离对话", kind: "main", updatedAt: 50, messageCount: 1, artifactIds: [] },
  ],
  activeSessionId: "s2" as string | null,
  activeProjectId: null as string | null,
  setActiveProject: vi.fn(),
  createFolder: vi.fn(() => "folder-new"),
  moveSessionToFolder: vi.fn(),
};

vi.mock("@/lib/stores/chat/chatHistory", () => ({
  useChatHistory: (selector: (state: typeof historyState) => unknown) => selector(historyState),
}));

import ProjectPickerChip from "./ProjectPickerChip";

beforeEach(() => {
  historyState.activeSessionId = "s2";
  historyState.activeProjectId = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectPickerChip", () => {
  it("默认显示 No Projects（当前会话没有项目）", () => {
    render(<ProjectPickerChip />);
    const trigger = screen.getByTestId("composer-project-chip");
    expect(trigger).toHaveTextContent("No Projects");
    expect(trigger).toHaveAttribute("aria-label", "对话所属项目");
  });

  it("当前会话有项目时显示项目名", () => {
    historyState.activeSessionId = "s1";
    render(<ProjectPickerChip />);
    expect(screen.getByTestId("composer-project-chip")).toHaveTextContent("组胚");
  });

  it("菜单列最近项目，选一个就同时改落点并把当前会话挂过去", () => {
    render(<ProjectPickerChip />);
    fireEvent.click(screen.getByTestId("composer-project-chip"));
    expect(screen.getByText("最近项目")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("composer-project-option-folder-a"));
    expect(historyState.setActiveProject).toHaveBeenCalledWith("folder-a");
    expect(historyState.moveSessionToFolder).toHaveBeenCalledWith("s2", "folder-a");
    // 菜单选完就关
    expect(screen.queryByText("最近项目")).toBeNull();
  });

  it("添加新项目：建完即选中，并把当前会话挂过去", () => {
    render(<ProjectPickerChip />);
    fireEvent.click(screen.getByTestId("composer-project-chip"));
    fireEvent.click(screen.getByTestId("composer-project-add"));
    const input = screen.getByTestId("composer-project-name");
    fireEvent.change(input, { target: { value: "期中复习" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(historyState.createFolder).toHaveBeenCalledWith("期中复习");
    expect(historyState.setActiveProject).toHaveBeenCalledWith("folder-new");
    expect(historyState.moveSessionToFolder).toHaveBeenCalledWith("s2", "folder-new");
  });

  it("已经属于某个项目时提供「不使用项目」，点了回到 Recents", () => {
    historyState.activeSessionId = "s1";
    render(<ProjectPickerChip />);
    fireEvent.click(screen.getByTestId("composer-project-chip"));
    fireEvent.click(screen.getByTestId("composer-project-clear"));
    expect(historyState.setActiveProject).toHaveBeenCalledWith(null);
    expect(historyState.moveSessionToFolder).toHaveBeenCalledWith("s1", null);
  });
});