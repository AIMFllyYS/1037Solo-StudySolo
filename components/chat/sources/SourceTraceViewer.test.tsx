import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SourceTraceViewer from "./SourceTraceViewer";
import { openSourceTrace, openWebSearchSources } from "@/lib/chat/openSourceTrace";
import type { SourceRound, TraceSource } from "@/lib/chat/traceSources";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

function windowData(): Record<string, unknown> {
  return (useWindowManager.getState().windows[0]?.data ?? {}) as Record<string, unknown>;
}

describe("SourceTraceViewer", () => {
  beforeEach(() => {
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  afterEach(() => {
    cleanup();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  it("shows a left-hand source directory and keeps notes in the window", () => {
    openSourceTrace([
      { kind: "note", title: "课堂笔记", path: "probability/detail/1.1", snippet: "样本空间" },
      { kind: "web", title: "维基百科", url: "https://example.org/wiki", snippet: "定义" },
    ]);
    render(<SourceTraceViewer />);
    expect(screen.getByLabelText("来源目录")).toBeVisible();
    expect(screen.getByText("课堂笔记")).toBeVisible();
    expect(screen.getByText("维基百科")).toBeVisible();
    expect(screen.getByText("样本空间")).toBeVisible();
    fireEvent.click(screen.getByText("维基百科"));
    expect(screen.getByTitle("维基百科")).toHaveAttribute("src", "https://example.org/wiki");
    expect(screen.getByRole("link", { name: "https://example.org/wiki" })).toHaveAttribute("href", "https://example.org/wiki");
    expect(useWindowManager.getState().windows).toHaveLength(1);
  });

  it("gives unique keys when several web sources have no url", () => {
    openSourceTrace([
      { kind: "web", title: "空链接甲", url: "", snippet: "甲" },
      { kind: "web", title: "空链接乙", url: "", snippet: "乙" },
    ]);
    render(<SourceTraceViewer />);
    expect(screen.getAllByText("空链接甲").length).toBeGreaterThan(0);
    expect(screen.getAllByText("空链接乙").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("空链接乙")[0]);
    expect(screen.getByText("乙")).toBeVisible();
    expect(screen.getByTestId("web-source-address")).toHaveTextContent("此来源未提供链接");
  });

  it("opens one window for a web-search result set", () => {
    openWebSearchSources(
      [
        { title: "课程 A", url: "https://example.edu/a", snippet: "摘要 A" },
        { title: "课程 B", url: "https://example.edu/b", snippet: "摘要 B" },
      ],
      "https://example.edu/b",
    );
    render(<SourceTraceViewer />);
    expect(useWindowManager.getState().windows).toHaveLength(1);
    expect(screen.getByText("课程 A")).toBeVisible();
    expect(screen.getByTitle("课程 B")).toHaveAttribute("src", "https://example.edu/b");
    expect(screen.getByRole("link", { name: "https://example.edu/b" })).toHaveAttribute("href", "https://example.edu/b");
    fireEvent.click(screen.getByText("课程 A"));
    expect(screen.getByRole("link", { name: "https://example.edu/a" })).toHaveAttribute("href", "https://example.edu/a");
  });

  // 按检索轮次分组：分组标题 = 工具既有展示名 + query（不新增文案）。
  it("groups the source directory by search round", () => {
    const rounds: SourceRound[] = [
      {
        id: "0:searchNotes:0:贝叶斯",
        tool: "searchNotes",
        query: "贝叶斯",
        sources: [{ kind: "note", title: "课堂笔记", path: "probability/detail/1.1", snippet: "样本空间" }],
      },
      {
        id: "1:webSearch:0:全概率",
        tool: "webSearch",
        query: "全概率",
        sources: [{ kind: "web", title: "维基百科", url: "https://example.org/wiki", snippet: "定义" }],
      },
    ];
    const sources: TraceSource[] = rounds.flatMap((round) => round.sources);
    openSourceTrace(sources, { rounds });
    render(<SourceTraceViewer />);

    expect(screen.getByText("检索笔记")).toBeVisible();
    expect(screen.getByText("搜索网页")).toBeVisible();
    expect(screen.getByText("贝叶斯")).toBeVisible();
    expect(screen.getByText("全概率")).toBeVisible();

    // 点来源照旧切正文，且 rounds 必须留在窗口 data 里（updateWindow 是整块替换 data）
    fireEvent.click(screen.getByText("维基百科"));
    expect(screen.getByTitle("维基百科")).toHaveAttribute("src", "https://example.org/wiki");
    expect(windowData().rounds).toHaveLength(2);
    expect(screen.getByText("检索笔记")).toBeVisible();
  });

  it("lets a round override the group label", () => {
    const rounds: SourceRound[] = [
      {
        id: "r1",
        tool: "webSearch",
        query: "全概率",
        label: "联网检索",
        sources: [{ kind: "web", title: "维基百科", url: "https://example.org/wiki", snippet: "定义" }],
      },
    ];
    openSourceTrace(rounds[0].sources, { rounds });
    render(<SourceTraceViewer />);

    expect(screen.getByText("联网检索")).toBeVisible();
    expect(screen.queryByText("搜索网页")).toBeNull();
  });

  // 只传 sources 的旧调用方：窗口 data 不多出 rounds 字段，目录也不出分组标题。
  it("keeps the old data shape when no rounds are passed", () => {
    openSourceTrace([{ kind: "web", title: "维基百科", url: "https://example.org/wiki", snippet: "定义" }]);
    expect("rounds" in windowData()).toBe(false);
    render(<SourceTraceViewer />);
    expect(screen.getByText("维基百科")).toBeVisible();
  });
});