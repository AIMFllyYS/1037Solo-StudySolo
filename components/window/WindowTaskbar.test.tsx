import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import WindowTaskbar from "./WindowTaskbar";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { MAX_LOCAL_FILE_SIZE } from "@/lib/ai/imageUtils";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useFlashcardCitations } from "@/lib/stores/flashcardCitations";
import { useAgentProductPicker } from "@/lib/stores/agentProductPicker";
import { SPOTLIGHT_INPUT_CLASS, SPOTLIGHT_SEARCH_FIELD_CLASS } from "@/components/search/spotlightChrome";
import {activateStorageOwner} from '@/lib/storage/ownerScope';

describe("WindowTaskbar add content", () => {
  beforeEach(() => {
    activateStorageOwner('10000000-0000-4000-8000-000000000001');
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    useUserNotes.setState({
      byId: {},
      order: [],
      openEditorIds: [],
      libraryOpen: false,
      libraryIntent: "browse",
      librarySubjectId: null,
    });
    useFlashcardCitations.setState({ open: false, subjectId: null, activeCardId: null });
    useAgentProductPicker.setState({ open: false, kind: "document" });
  });

  afterEach(() => {
    activateStorageOwner(null);
    cleanup();
    vi.unstubAllGlobals();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  it("keeps a glowing plus slot available and opens a URL as a taskbar window", async () => {
    const fetchIcon = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchIcon);
    render(<WindowTaskbar host="topbar" />);
    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    const menu = screen.getByRole("menu", { name: "添加内容" });
    expect(menu).toBeVisible();
    expect(menu.parentElement).toBe(document.body);

    fireEvent.change(screen.getByRole("textbox", { name: "网址" }), { target: { value: "example.com/course" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.queryByRole("menu", { name: "添加内容" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "输入网址" })).not.toBeInTheDocument();

    const preview = useWindowManager.getState().windows.find((win) => win.type === "source-preview");
    expect(preview?.title).toBe("网址 · example.com");
    expect(preview?.data).toMatchObject({ url: "https://example.com/course" });
    expect(screen.getByRole("button", { name: "添加内容" })).toBeVisible();
    await waitFor(() => expect(fetchIcon).toHaveBeenCalledWith("https://example.com/course", expect.objectContaining({ credentials: "omit" })));
  });

  it("groups plus menu items with the same dividers as add-file used to have", () => {
    render(<WindowTaskbar host="topbar" />);
    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    const menu = screen.getByRole("menu", { name: "添加内容" });

    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/^选择笔记/),
      expect.stringMatching(/^复习闪卡页面/),
      expect.stringMatching(/^导入长文本/),
      expect.stringMatching(/^导入可交互 HTML/),
      expect.stringMatching(/^新建笔记/),
      expect.stringMatching(/^添加文件/),
    ]);

    const openPanels = within(menu).getByRole("group", { name: "打开面板" });
    expect(within(openPanels).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^选择笔记/),
      expect.stringMatching(/^复习闪卡页面/),
    ]);

    const imports = within(menu).getByRole("group", { name: "导入产物" });
    expect(within(imports).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^导入长文本/),
      expect.stringMatching(/^导入可交互 HTML/),
    ]);

    const files = within(menu).getByRole("group", { name: "新建文件" });
    expect(within(files).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^新建笔记/),
      expect.stringMatching(/^添加文件/),
    ]);

    const url = within(menu).getByRole("group", { name: "输入网址" });
    expect(within(url).getByRole("textbox", { name: "网址" })).toHaveClass(...SPOTLIGHT_INPUT_CLASS.split(" "));
    expect(within(url).getByRole("textbox", { name: "网址" }).parentElement).toHaveClass(
      ...SPOTLIGHT_SEARCH_FIELD_CLASS.split(" "),
    );
    expect(within(url).queryByRole("menuitem")).not.toBeInTheDocument();

    const dividers = menu.querySelectorAll("[data-menu-divider]");
    expect(dividers).toHaveLength(3);
    expect(dividers[0]).toHaveClass("my-1", "border-t");
    expect(dividers[1]).toHaveClass("my-1", "border-t");
    expect(dividers[2]).toHaveClass("my-1", "border-t");
    expect(openPanels.nextElementSibling).toBe(dividers[0]);
    expect(dividers[0]!.nextElementSibling).toBe(imports);
    expect(imports.nextElementSibling).toBe(dividers[1]);
    expect(dividers[1]!.nextElementSibling).toBe(files);
    expect(files.nextElementSibling).toBe(dividers[2]);
    expect(dividers[2]!.nextElementSibling).toBe(url);
  });

  it("shows a modal when a local file exceeds the workspace limit", async () => {
    const { container } = render(<WindowTaskbar host="topbar" />);
    const file = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_LOCAL_FILE_SIZE + 1 });
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("alertdialog", { name: "文件添加失败" })).toHaveTextContent("512MiB");
    });
  });

  it("opens a pptx as PowerPoint, not PDF", async () => {
    const { container } = render(<WindowTaskbar host="topbar" />);
    const archive = zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>第一页</a:t></p:sld>") });
    const file = new File([archive], "课.slides.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      const preview = useWindowManager.getState().windows.find((win) => win.type === "attachment-preview");
      expect(preview?.data).toMatchObject({
        kind: "ppt",
        name: "课.slides.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
    });
  });

  it("opens a new markdown note from the plus menu", () => {
    render(<WindowTaskbar host="topbar" />);
    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /新建笔记/ }));

    const editor = useWindowManager.getState().windows.find((win) => win.type === "user-note-editor");
    expect(editor).toBeDefined();
    expect(useUserNotes.getState().order).toHaveLength(1);
    const note = useUserNotes.getState().byId[useUserNotes.getState().order[0]!];
    expect(note?.title).toBe("无标题笔记");
    expect(note?.markdown.trim()).toBe("");
    expect(note?.markdown).not.toMatch(/\$E = mc\^\{2\}\$/);
  });

  it("opens the note picker and flashcard picker from the plus menu", () => {
    render(<WindowTaskbar host="topbar" />);
    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /选择笔记/ }));
    expect(useWindowManager.getState().windows.some((win) => win.type === "user-note-library")).toBe(true);
    expect(useUserNotes.getState().libraryIntent).toBe("cite");
    expect(useUserNotes.getState().byId["example-user-note"]?.title).toBe("案例笔记");

    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    expect(screen.getByRole("menuitem", { name: /复习闪卡页面/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /选择复习闪卡/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /复习闪卡页面/ }));
    expect(useWindowManager.getState().windows.some((win) => win.type === "flashcard-cite-picker")).toBe(true);
    expect(useFlashcardCitations.getState().open).toBe(true);
  });

  it("opens document and artifact import pickers from the plus menu", () => {
    render(<WindowTaskbar host="topbar" />);
    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /导入长文本/ }));
    expect(useAgentProductPicker.getState()).toMatchObject({ open: true, kind: "document" });
    expect(useWindowManager.getState().windows.some((win) => win.type === "agent-product-picker")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /导入可交互 HTML/ }));
    expect(useAgentProductPicker.getState()).toMatchObject({ open: true, kind: "artifact" });
  });
});
