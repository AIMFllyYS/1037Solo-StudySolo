import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalSearchButton from "./GlobalSearchButton";
import { SPOTLIGHT_BODY_CLASS, SPOTLIGHT_PANEL_CLASS } from "./spotlightChrome";
import { useGlobalSearch } from "@/lib/keyboard/useGlobalSearch";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useAcademicYear } from "@/lib/stores/academicYear";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  useGlobalSearch.setState({ open: false });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useUserNotes.setState({
    byId: {},
    order: [],
    openEditorIds: [],
    _hasHydrated: true,
  });
  useReviewCards.setState({ byId: {}, order: [], _hasHydrated: true });
  useAcademicYear.setState({ year: "sophomore-1" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ hits: [] }), { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  useGlobalSearch.setState({ open: false });
  vi.unstubAllGlobals();
});

function openSearch() {
  render(<GlobalSearchButton />);
  fireEvent.click(screen.getByTitle(/全局搜索/));
  return screen.getByPlaceholderText(/搜索章节、正文、笔记、闪卡/);
}

describe("GlobalSearchButton", () => {
  it("opens a spotlight dialog with the shared panel size", () => {
    render(<GlobalSearchButton />);
    fireEvent.click(screen.getByTitle(/全局搜索/));
    const dialog = screen.getByRole("dialog", { name: "全局搜索" });
    expect(dialog).toHaveClass(...SPOTLIGHT_PANEL_CLASS.split(" "));
    expect(dialog.innerHTML).toContain(SPOTLIGHT_BODY_CLASS.split(" ")[0]);
  });

  it("章节名立刻出现在正文栏，且不按当前学年裁掉大一章节", async () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "贝叶斯" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "正文" })).toBeInTheDocument();
      expect(screen.getAllByText(/贝叶斯公式/).length).toBeGreaterThan(0);
    });
  });

  it("笔记标题和正文都能命中，点开笔记编辑器", async () => {
    const id = useUserNotes.getState().createNote("cell-biology", {
      title: "核糖体笔记",
      markdown: "核糖体是合成蛋白质的场所",
    });
    useUserNotes.setState({ _hasHydrated: true });
    const input = openSearch();
    fireEvent.change(input, { target: { value: "合成蛋白质" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "笔记" })).toBeInTheDocument();
      expect(screen.getByText("核糖体笔记")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("核糖体笔记"));
    expect(useUserNotes.getState().openEditorIds).toContain(id);
  });

  it("闪卡正面/原文能命中", async () => {
    const cardId = useReviewCards.getState().addSaved("课堂划词：泊松", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      cardId,
      { mode: "excerpt", cardType: "excerpt", front: "什么是泊松分布？", back: "描述单位时间稀有事件次数" },
      "test",
    );
    useReviewCards.setState({ _hasHydrated: true });
    const input = openSearch();
    fireEvent.change(input, { target: { value: "稀有事件" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "闪卡" })).toBeInTheDocument();
      expect(screen.getByText("什么是泊松分布？")).toBeInTheDocument();
    });
  });

  it("HTML 公式页不会作为章节命中", async () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "概率论公式" } });
    await waitFor(() => {
      expect(screen.queryByText("概率论公式")).toBeNull();
    });
  });

  it("搜索框最右侧是固定类二级筛选，按种类只保留笔记栏", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    useUserNotes.getState().createNote("cell-biology", {
      title: "核糖体笔记",
      markdown: "核糖体是合成蛋白质的场所",
    });
    useUserNotes.setState({ _hasHydrated: true });
    const input = openSearch();
    const filter = screen.getByTestId("global-search-filter");
    expect(input.nextElementSibling).toBe(filter);
    expect(filter.nextElementSibling).toHaveAttribute("title", "关闭");

    fireEvent.click(filter);
    const root = screen.getByRole("menu", { name: "筛选搜索" });
    expect(root).toHaveClass("app-menu");
    expect(screen.getByTestId("search-filter-by-kind")).toHaveTextContent("按种类");
    expect(screen.getByTestId("search-filter-by-subject")).toHaveTextContent("按课程");

    fireEvent.click(screen.getByTestId("search-filter-by-kind"));
    fireEvent.click(screen.getByTestId("search-filter-kind-note"));

    fireEvent.change(input, { target: { value: "核糖体" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "笔记" })).toBeInTheDocument();
      expect(screen.getByText("核糖体笔记")).toBeInTheDocument();
    });
    expect(screen.queryByRole("region", { name: "正文" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "闪卡" })).not.toBeInTheDocument();
  });

  it("按课程筛选后只保留该学科的笔记和正文", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    useUserNotes.getState().createNote("cell-biology", {
      title: "核糖体笔记",
      markdown: "核糖体是合成蛋白质的场所",
    });
    useUserNotes.getState().createNote("probability", {
      title: "贝叶斯笔记",
      markdown: "由果溯因",
    });
    useUserNotes.setState({ _hasHydrated: true });
    const input = openSearch();
    fireEvent.click(screen.getByTestId("global-search-filter"));
    fireEvent.click(screen.getByTestId("search-filter-by-subject"));
    fireEvent.click(screen.getByTestId("search-filter-subject-cell-biology"));

    fireEvent.change(input, { target: { value: "笔记" } });
    await waitFor(() => {
      expect(screen.getByText("核糖体笔记")).toBeInTheDocument();
    });
    expect(screen.queryByText("贝叶斯笔记")).not.toBeInTheDocument();
  });

  it("正文分片加载中显示骨架，而不是空白转圈", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const input = openSearch();
    fireEvent.change(input, { target: { value: "由果溯因" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "正文" })).toBeInTheDocument();
      expect(document.querySelector("[data-search-skeleton]")).toBeTruthy();
    });
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});
