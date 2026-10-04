import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const editorMock = vi.hoisted(() => ({ rejectCreate: false }));
let emitMarkdown: ((_ctx: unknown, markdown: string) => void) | null = null;

vi.mock("@milkdown/crepe", () => ({
  Crepe: class MockCrepe {
    static Feature = {
      ImageBlock: "image",
      TopBar: "topbar",
      AI: "ai",
      Latex: "latex",
      Toolbar: "toolbar",
      BlockEdit: "blockedit",
      Placeholder: "placeholder",
    };
    editor = { config: vi.fn() };
    on(callback: (listener: { markdownUpdated: (fn: (_ctx: unknown, value: string) => void) => void }) => void) {
      callback({ markdownUpdated: (listener) => { emitMarkdown = listener; } });
    }
    create() {
      return editorMock.rejectCreate ? Promise.reject(new Error("synthetic editor boot failure")) : Promise.resolve();
    }
    destroy() { return Promise.resolve(); }
  },
}));

import MilkdownNoteEditor from "./MilkdownNoteEditor";

describe("MilkdownNoteEditor owner callback guard", () => {
  beforeEach(() => {
    emitMarkdown = null;
    editorMock.rejectCreate = false;
  });
  afterEach(() => {
    cleanupEditor();
    vi.restoreAllMocks();
  });

  let unmount: (() => void) | null = null;
  function cleanupEditor() {
    unmount?.();
    unmount = null;
  }

  it("keeps the guard captured by the old editor mount after a new owner rerender", async () => {
    const onChange = vi.fn();
    const oldOwnerGuard = vi.fn(() => false);
    const newOwnerGuard = vi.fn(() => true);
    const view = render(
      <MilkdownNoteEditor value="# A" onChange={onChange} onChangeGuard={oldOwnerGuard} />,
    );
    unmount = view.unmount;
    await act(async () => { await Promise.resolve(); });

    view.rerender(
      <MilkdownNoteEditor value="# B" onChange={onChange} onChangeGuard={newOwnerGuard} />,
    );
    await act(async () => { emitMarkdown?.({}, "stale old-owner callback"); });

    expect(oldOwnerGuard).toHaveBeenCalled();
    expect(newOwnerGuard).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("guards the source-mode textarea with the failed editor mount's owner binding", async () => {
    editorMock.rejectCreate = true;
    const onChange = vi.fn();
    const oldOwnerGuard = vi.fn(() => false);
    const newOwnerGuard = vi.fn(() => true);
    const view = render(
      <MilkdownNoteEditor value="# A" onChange={onChange} onChangeGuard={oldOwnerGuard} />,
    );
    unmount = view.unmount;
    await act(async () => { await Promise.resolve(); });
    const textarea = screen.getByRole("textbox");

    view.rerender(
      <MilkdownNoteEditor value="# B" onChange={onChange} onChangeGuard={newOwnerGuard} />,
    );
    fireEvent.change(textarea, { target: { value: "stale source-mode edit" } });

    expect(oldOwnerGuard).toHaveBeenCalled();
    expect(newOwnerGuard).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a delayed Crepe update after the editor has unmounted", async () => {
    const onChange = vi.fn();
    const view = render(<MilkdownNoteEditor value="# A" onChange={onChange} />);
    unmount = view.unmount;
    await act(async () => { await Promise.resolve(); });

    view.unmount();
    unmount = null;
    await act(async () => { emitMarkdown?.({}, "disposed editor update"); });

    expect(onChange).not.toHaveBeenCalled();
  });
});
