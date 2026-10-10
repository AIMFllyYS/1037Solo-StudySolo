import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setPinned = vi.fn();
const removeFile = vi.fn();
const addStudioRef = vi.fn();

const state = {
  order: ["f1"],
  byId: {
    f1: {
      id: "f1",
      projectId: "p1",
      kind: "imported",
      name: "组胚讲义.md",
      mimeType: "text/markdown",
      status: "indexed",
      indexMarkdown: "# 组胚讲义.md · 索引\n\n- 切片数：2",
      charCount: 120,
      slices: [
        { id: "slice-1", title: "上皮组织", chars: 60, summary: "被覆上皮", text: "上皮组织的正文" },
        { id: "slice-2", title: "结缔组织", chars: 60, summary: "固有结缔组织", text: "结缔组织的正文" },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  },
  setPinned,
  removeFile,
  addStudioRef,
};

vi.mock("@/lib/stores/assets/projectFiles", () => ({
  useProjectFiles: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state,
  }),
  listProjectFiles: (s: typeof state, projectId: string) =>
    s.order.map((id) => (s.byId as Record<string, { projectId: string }>)[id]).filter((entry) => entry && entry.projectId === projectId),
}));
vi.mock("@/lib/stores/chat/chatHistory", () => ({
  useChatHistory: (selector: (s: unknown) => unknown) =>
    selector({ folders: [{ id: "p1", name: "组胚", createdAt: 1 }] }),
}));
vi.mock("@/lib/stores/workspace/windowManager", () => ({
  useWindowManager: { getState: () => ({ closeWindow: vi.fn() }) },
}));
vi.mock("@/lib/project/studioRefs", () => ({
  searchStudioRefs: (query: string) =>
    query.trim()
      ? [{ path: "histology/detail/1.1", title: "上皮组织", address: "组织学 › 上皮", subjectId: "histology", categoryId: "detail", itemId: "1.1" }]
      : [],
}));
vi.mock("@/components/window/ManagedWindow", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="managed-window">{children}</div>,
}));
vi.mock("@/components/window/DocumentWorkspace", () => ({
  default: ({ children, toolbar, folderTree }: { children: React.ReactNode; toolbar?: React.ReactNode; folderTree?: React.ReactNode }) => (
    <div>
      {toolbar}
      {folderTree}
      <div data-testid="workspace-body">{children}</div>
    </div>
  ),
}));

import ProjectFilesWindow from "./ProjectFilesWindow";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectFilesWindow", () => {
  it("索引视图先给概览数据块（切片 / 字数 / 保存位置），再给索引原文", () => {
    render(<ProjectFilesWindow projectId="p1" />);
    const body = screen.getByTestId("workspace-body");
    expect(body).toHaveTextContent("切片");
    expect(body).toHaveTextContent("字数");
    expect(body).toHaveTextContent("120");
    expect(body).toHaveTextContent("索引正文");
  });

  it("解析失败的文件：树上标红，正文给原因与重试入口，而不是一片空白", () => {
    const file = state.byId.f1 as Record<string, unknown>;
    const previous = { ...file };
    Object.assign(file, { status: "error", error: "这份 PDF 无法读取文字", slices: [], charCount: 0 });
    try {
      render(<ProjectFilesWindow projectId="p1" />);
      expect(screen.getByTestId("project-file-tree")).toHaveTextContent("失败");
      const body = screen.getByTestId("workspace-body");
      expect(body).toHaveTextContent("这个文件没能解析");
      expect(body).toHaveTextContent("这份 PDF 无法读取文字");
      expect(screen.getAllByRole("button", { name: /重新导入/ }).length).toBeGreaterThan(0);
    } finally {
      Object.assign(file, previous);
    }
  });

  it("左树列出文件，默认显示索引正文与携带状态", () => {
    render(<ProjectFilesWindow projectId="p1" />);
    expect(screen.getByTestId("project-file-tree")).toHaveTextContent("组胚讲义.md");
    expect(screen.getByTestId("project-carry-status")).toHaveTextContent("已全部带入（2 片 · 120 字）");
    // 索引视图直接渲染索引 markdown；不再贴一行「.index.md · 隐藏索引」标题
    expect(screen.getByTestId("workspace-body")).toHaveTextContent("组胚讲义.md · 索引");
    expect(screen.getByTestId("workspace-body")).not.toHaveTextContent("隐藏索引");
    expect(screen.getByTestId("workspace-body")).toHaveTextContent("切片数：2");
  });

  it("引用教材：搜到就落一条软链接（只记 path）", () => {
    render(<ProjectFilesWindow projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "引用 Studio 教材" }));
    fireEvent.change(screen.getByTestId("project-studio-search"), { target: { value: "上皮" } });
    fireEvent.click(screen.getByTestId("project-studio-ref-histology/detail/1.1"));
    expect(addStudioRef).toHaveBeenCalledWith({
      projectId: "p1",
      ref: expect.objectContaining({ path: "histology/detail/1.1" }),
    });
  });

  it("移除文件必须二次确认后才走 store", () => {
    render(<ProjectFilesWindow projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /移除/ }));
    expect(removeFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));
    expect(removeFile).toHaveBeenCalledWith("f1");
  });
});
