import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUserNotes } from "@/lib/stores/userNotes";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="milkdown" />,
}));

import { ReviewNoteEditor } from "./ReviewNotesPane";

describe("ReviewNoteEditor", () => {
  beforeEach(() => {
    useUserNotes.setState({ byId: {}, order: [] } as never);
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
});
