import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { listFlashcardSubjectGroups } from "@/lib/notes/flashcardSubjects";
import { navTree } from "@/lib/content-data/nav";
import { NOTEBOOK_FILE_MIME } from "@/lib/chat/composerIntent";
import TextbookWindow from "./TextbookWindow";

vi.mock("@/components/window/ManagedWindow", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section>,
}));

describe("TextbookWindow", () => {
  it("按学年列出学科，展开后树里的栏目可以拖进输入框（不注入上下文）", () => {
    const group = listFlashcardSubjectGroups()[0]!;
    const subject = group.subjects.find((entry) => navTree.subjects.some((nav) => nav.id === entry.id && nav.categories.some((cat) => cat.items.length > 0)))!;
    const navSubject = navTree.subjects.find((entry) => entry.id === subject.id)!;
    const category = navSubject.categories.find((cat) => cat.items.length > 0)!;
    const item = category.items[0]!;

    render(<TextbookWindow />);
    expect(screen.getByTestId(`textbook-year-${group.yearId}`)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByText(subject.fullName));
    fireEvent.click(screen.getByText(category.name));
    const row = screen.getAllByText(item.title)[0]!.closest("button")!;
    expect(row).toHaveAttribute("draggable", "true");

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: "", types: [] } });
    expect(setData).toHaveBeenCalledWith(NOTEBOOK_FILE_MIME, expect.stringContaining(item.id));
  });
});
