import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { listFlashcardSubjectGroups } from "@/lib/notes/library/flashcardSubjects";
import { navTree } from "@/lib/content-data/nav";
import { NOTEBOOK_FILE_MIME } from "@/lib/chat/composer/composerIntent";
import { openTextbookWindow, TEXTBOOK_WINDOW_ID } from "@/lib/textbook/openTextbook";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import type { TextbookReadingState } from "@/lib/textbook/state";
import TextbookWindow from "./TextbookWindow";

vi.mock("@/components/window/ManagedWindow", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section>,
}));
vi.mock("@/components/notes/NoteRenderer", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }));

describe("TextbookWindow", () => {
  beforeEach(() => useWindowManager.setState({ windows: [], activeWindowId: null }));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("按学年列出学科，展开后树里的栏目可以拖进输入框（不注入上下文）", () => {
    const group = listFlashcardSubjectGroups()[0]!;
    const subject = group.subjects.find((entry) => navTree.subjects.some((nav) => nav.id === entry.id && nav.categories.some((cat) => cat.items.length > 0)))!;
    const navSubject = navTree.subjects.find((entry) => entry.id === subject.id)!;
    const category = navSubject.categories.find((cat) => cat.items.length > 0)!;
    const item = category.items[0]!;

    useAcademicYear.setState({ year: group.yearId });
    render(<TextbookWindow />);
    expect(within(screen.getByTestId("textbook-tree-panel")).getByText(group.label)).toBeInTheDocument();

    fireEvent.click(screen.getByText(subject.fullName));
    fireEvent.click(screen.getByText(category.name));
    const row = screen.getAllByText(item.title)[0]!.closest("button")!;
    expect(row).toHaveAttribute("draggable", "true");

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: "", types: [] } });
    expect(setData).toHaveBeenCalledWith(NOTEBOOK_FILE_MIME, expect.stringContaining(item.id));
  });
  it("教材树固定在正文之后的最右侧，选择入口复用学期学科文件夹树", () => {
    render(<TextbookWindow />);
    const body = screen.getByTestId("textbook-body");
    expect(body.nextElementSibling).toBe(screen.getByTestId("textbook-tree-panel"));
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByTestId("textbook-choose"));
    expect(screen.getByTestId("year-subject-folder-tree")).toBeInTheDocument();
    expect(screen.getByTestId("textbook-choose")).toHaveAttribute("aria-expanded", "true");
  });
  it("直接选择学期行会切换该学期全部教材并清除旧学科，重挂载保留学期", () => {
    useAcademicYear.setState({ year: "sophomore-1" });
    openTextbookWindow();
    const view = render(<TextbookWindow />);
    fireEvent.click(screen.getByTestId("textbook-choose"));
    const picker = within(screen.getByTestId("textbook-selection-tree"));
    fireEvent.click(picker.getByRole("button", { name: "大一下学期" }));
    fireEvent.click(picker.getByRole("button", { name: "完成" }));
    expect(within(screen.getByTestId("textbook-tree-panel")).getByText("大一下学期")).toBeInTheDocument();
    expect(within(screen.getByTestId("textbook-folder-tree")).getByRole("button", { name: "概率论与数理统计" })).toBeInTheDocument();
    expect(within(screen.getByTestId("textbook-folder-tree")).queryByText("医学细胞生物学")).toBeNull();
    const saved = useWindowManager.getState().windows.find((window) => window.id === TEXTBOOK_WINDOW_ID)!.data as TextbookReadingState;
    expect(saved).toMatchObject({ yearId: "freshman-2", subjectId: null, selection: null, expandedKeys: [] });
    view.unmount();
    render(<TextbookWindow />);
    expect(within(screen.getByTestId("textbook-tree-panel")).getByText("大一下学期")).toBeInTheDocument();
  });
  it("同一教材窗口在右栏收起重挂载后恢复当前章节与展开树，再打开入口也不丢阅读状态", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: "# 章节正文\n\n已读内容保留", format: "markdown" }) }));
    const group = listFlashcardSubjectGroups()[0]!;
    const subject = group.subjects.find((entry) => navTree.subjects.some((nav) => nav.id === entry.id && nav.categories.some((category) => category.items.length > 0)))!;
    const category = navTree.subjects.find((entry) => entry.id === subject.id)!.categories.find((entry) => entry.items.length > 0)!;
    useAcademicYear.setState({ year: group.yearId });
    openTextbookWindow();
    const view = render(<TextbookWindow />);
    fireEvent.click(screen.getByText(subject.fullName));
    fireEvent.click(screen.getByText(category.name));
    let item = category.items[0]!;
    while (item.children?.length) {
      fireEvent.click(within(screen.getByTestId("textbook-folder-tree")).getByText(item.title));
      item = item.children[0]!;
    }
    fireEvent.click(within(screen.getByTestId("textbook-folder-tree")).getByText(item.title));
    const saved = useWindowManager.getState().windows.find((window) => window.id === TEXTBOOK_WINDOW_ID)?.data as TextbookReadingState;
    expect(saved.selection?.item.id).toBe(item.id);
    expect(saved.expandedKeys).toContain(`s:${subject.id}`);
    view.unmount();
    openTextbookWindow();
    render(<TextbookWindow />);
    expect(within(screen.getByTestId("textbook-folder-tree")).getByText(item.title).closest("button")).toHaveAttribute("aria-current", "true");
    expect(await screen.findByText(/已读内容保留/)).toBeInTheDocument();
  });
  it("医学细胞生物学父目录一次点击同时保留展开与选择，子节阅读及重挂载恢复不覆盖展开键", async () => {
    const subject = navTree.subjects.find((entry) => entry.id === "cell-biology")!;
    const category = subject.categories.find((entry) => entry.id === "textbook")!;
    const chapter = category.items.find((item) => item.id === "ch01")!;
    const subsection = chapter.children![0]!;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => new URL(url, "http://localhost").searchParams.get("itemId") === chapter.id ? { content: null, format: null } : { content: "# 第一节正文\n\n第一节完整内容", format: "markdown" } })));
    useAcademicYear.setState({ year: "sophomore-1" });
    openTextbookWindow();
    const view = render(<TextbookWindow />);
    fireEvent.click(screen.getByTestId("textbook-choose"));
    fireEvent.click(within(screen.getByTestId("textbook-selection-tree")).getByRole("button", { name: subject.name }));
    fireEvent.click(within(screen.getByTestId("textbook-folder-tree")).getByText(category.name));
    const parent = within(screen.getByTestId("textbook-folder-tree")).getByText(chapter.title, { normalizer: (text) => text }).closest("button")!;
    expect(parent).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
    const afterParent = useWindowManager.getState().windows.find((window) => window.id === TEXTBOOK_WINDOW_ID)!.data as TextbookReadingState;
    expect(afterParent.subjectId).toBe(subject.id);
    expect(afterParent.expandedKeys).toContain(`cell-biology/textbook/${chapter.id}`);
    expect(afterParent.selection?.item.id).toBe(chapter.id);
    expect(await screen.findByText("这是章节目录，请在右侧展开后选择子节阅读正文。")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("textbook-folder-tree")).getByText(subsection.title, { normalizer: (text) => text }));
    expect(await screen.findByText(/第一节完整内容/)).toBeInTheDocument();
    view.unmount();
    render(<TextbookWindow />);
    const restoredTree = within(screen.getByTestId("textbook-folder-tree"));
    expect(restoredTree.getByText(chapter.title, { normalizer: (text) => text }).closest("button")).toHaveAttribute("aria-expanded", "true");
    expect(restoredTree.getByText(subsection.title, { normalizer: (text) => text }).closest("button")).toHaveAttribute("aria-current", "true");
    expect(restoredTree.queryByText("医学英语")).toBeNull();
    expect(await screen.findByText(/第一节完整内容/)).toBeInTheDocument();
  });
});
