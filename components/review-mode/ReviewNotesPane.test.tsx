import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useOverlayStack } from "@/lib/keyboard/useOverlayStack";

const editorHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    value: string;
    onChange: (markdown: string) => void;
    onChangeGuard?: () => boolean;
  }>,
}));

vi.mock("next/dynamic", () => ({
  default: () => ({
    value = "",
    onChange,
    onChangeGuard,
  }: {
    value?: string;
    onChange: (markdown: string) => void;
    onChangeGuard?: () => boolean;
  }) => {
    editorHarness.instances.push({ value, onChange, onChangeGuard });
    return (
      <div data-testid="milkdown">
        {value.split(/\r?\n/).map((line, index) => {
          const heading = /^(#{1,3})\s+(.+)$/.exec(line);
          if (!heading) return null;
          const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3";
          return <Tag key={index + "-" + heading[2]}>{heading[2]}</Tag>;
        })}
      </div>
    );
  },
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 50,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 50 })),
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

import { ReviewNoteEditor } from "./ReviewNotesPane";
import { ReviewNotesList } from "./ReviewNotesPane";

describe("ReviewNoteEditor", () => {
  beforeEach(() => {
    useUserNotes.setState({ byId: {}, order: [], libraryRevision: 0 } as never);
    useOverlayStack.setState({ stack: [] });
    editorHarness.instances.length = 0;
  });

  it("空态的「新建笔记」创建并直接打开这篇笔记", async () => {
    const onCreated = vi.fn();
    render(<ReviewNoteEditor noteId={null} onDeleted={() => {}} onCreated={onCreated} />);
    expect(screen.getByTestId("review-note-empty")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "新建笔记" }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    const id = onCreated.mock.calls[0][0] as string;
    expect(useUserNotes.getState().byId[id]).toBeTruthy();
  });

  it("删除走应用内二次确认：取消不删，确认才删", async () => {
    const id = useUserNotes.getState().createNote(null);
    const onDeleted = vi.fn();
    const nativeConfirm = vi.spyOn(window, "confirm");
    render(<ReviewNoteEditor noteId={id} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByTestId("review-note-delete"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(useUserNotes.getState().byId[id]).toBeTruthy();

    await userEvent.click(screen.getByTestId("review-note-delete"));
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(useUserNotes.getState().byId[id]).toBeFalsy();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("renders the shared outline beside the document and navigates by clicked heading", async () => {
    const id = useUserNotes.getState().createNote("probability", {
      title: "泊松",
      markdown: "# 泊松分布\n\n## 均值与方差\n正文",
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(
      <ReviewNoteEditor
        noteId={id}
        navigation={<div data-testid="subject-tree-slot" />}
        onDeleted={() => {}}
        onRootClick={() => {}}
      />,
    );

    expect(screen.getByTestId("review-note-navigation")).toBeInTheDocument();
    expect(screen.getByTestId("review-note-toc")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "目录" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "均值与方差" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(screen.getByRole("button", { name: "均值与方差" })).toHaveAttribute("aria-current", "location");

    await userEvent.click(screen.getByRole("button", { name: "更换学科" }));
    const subjectMenu = await screen.findByRole("menu", { name: "更换学科" });
    expect(subjectMenu.closest(".review-note-workspace")).toBeNull();
    await userEvent.click(screen.getByTestId("subject-picker-option-physics"));
    expect(useUserNotes.getState().byId[id]?.subjectId).toBe("physics");
  });

  it("keeps a remote markdown replacement when an old editor callback arrives before React commits", () => {
    const id = useUserNotes.getState().createNote("anatomy", {
      title: "Remote merge QA",
      markdown: "# Original body",
    });
    render(<ReviewNoteEditor noteId={id} onDeleted={() => {}} />);
    expect(screen.queryByRole("button", { name: "显示学科笔记树" })).toBeNull();
    const oldEditor = editorHarness.instances.at(-1);
    expect(oldEditor?.value).toBe("# Original body");

    const remoteMarkdown = "# New remote revision\n\nKeep this body";
    act(() => {
      useUserNotes.setState((state) => ({
        byId: {
          ...state.byId,
          [id]: { ...state.byId[id]!, markdown: remoteMarkdown, updatedAt: Date.now() + 1 },
        },
      }));
      // Reproduce a delayed editor event in the same task as the remote merge,
      // before the workspace layout effect can refresh its revision baseline.
      oldEditor?.onChange("# Stale local body");
    });

    expect(useUserNotes.getState().byId[id]?.markdown).toBe(remoteMarkdown);
    expect(editorHarness.instances.at(-1)?.value).toBe(remoteMarkdown);
    expect(oldEditor?.onChangeGuard?.()).toBe(false);
    if (oldEditor?.onChangeGuard?.()) oldEditor.onChange("# Later stale local body");
    expect(useUserNotes.getState().byId[id]?.markdown).toBe(remoteMarkdown);
  });

  it("registers a drawer above its window so Escape closes only the drawer and restores focus", () => {
    const id = useUserNotes.getState().createNote("anatomy", {
      title: "Overlay priority QA",
      markdown: "# Overlay priority",
    });
    const closeWindow = vi.fn();
    useOverlayStack.getState().register({ id: "managed-window-review-note", onClose: closeWindow, priority: 30 });
    render(
      <ReviewNoteEditor
        noteId={id}
        navigation={<div data-testid="subject-tree-fixture">Subject folders</div>}
        onDeleted={() => {}}
      />,
    );
    const treeToggle = screen.getByRole("button", { name: "显示学科笔记树" });
    fireEvent.click(treeToggle);

    const stack = useOverlayStack.getState().stack;
    expect(stack.at(-1)?.id).toMatch(/^review-note-drawer-/);
    expect(stack.at(-1)?.priority).toBeGreaterThan(30);

    // The global keyboard provider handles Escape by closing this top entry.
    act(() => { useOverlayStack.getState().closeTop(); });
    expect(screen.getByTestId("review-note-workspace")).not.toHaveAttribute("data-navigation-open", "true");
    expect(document.activeElement).toBe(treeToggle);
    expect(closeWindow).not.toHaveBeenCalled();
    expect(useOverlayStack.getState().stack.map((entry) => entry.id)).toContain("managed-window-review-note");
  });

  it("keeps the Review subject tree and searchable title/body note list together", async () => {
    const probabilityId = useUserNotes.getState().createNote("probability", {
      title: "泊松笔记",
      markdown: "方差等于均值",
    });
    const physicsId = useUserNotes.getState().createNote("physics", {
      title: "牛顿笔记",
      markdown: "惯性定律",
    });
    const select = vi.fn();
    render(<ReviewNotesList activeId={probabilityId} onSelect={select} />);

    expect(screen.getByTestId("year-subject-folder-tree")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /泊松笔记/ })).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("review-note-search"), "方差");
    expect(await screen.findByRole("button", { name: /泊松笔记/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /牛顿笔记/ })).toBeNull();

    await userEvent.clear(screen.getByTestId("review-note-search"));
    fireEvent.click(screen.getByRole("button", { name: "大学物理" }));
    expect(select).toHaveBeenLastCalledWith(physicsId);
    expect(screen.getByRole("button", { name: /牛顿笔记/ })).toBeInTheDocument();
  });
});
