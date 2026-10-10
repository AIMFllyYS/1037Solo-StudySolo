import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/lib/stores/ui";
import { useOverlayStack } from "@/lib/keyboard/useOverlayStack";

const runtime = vi.hoisted(() => ({ pathname: "/review", mobile: true, search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => runtime.pathname,
  useSearchParams: () => new URLSearchParams(runtime.search),
}));

vi.mock("@/lib/hooks/layout/useIsMobile", () => ({ useIsMobile: () => runtime.mobile }));
vi.mock("./ReviewNotesPane", () => ({
  ReviewNotesList: ({ activeId, onSelect }: { activeId: string | null; onSelect: (id: string | null) => void }) => (
    <div data-testid="review-notes-list">
      <div data-testid="year-subject-folder-tree" />
      <span data-testid="review-list-active-id">{activeId ?? "none"}</span>
      <button type="button" data-testid="select-review-note" onClick={() => onSelect("selected-from-library")}>
        Select note
      </button>
    </div>
  ),
  ReviewNoteEditor: ({ noteId, navigation }: { noteId: string | null; navigation?: React.ReactNode }) => (
    <div data-testid="review-note-editor" data-note-id={noteId ?? "none"} data-has-navigation={Boolean(navigation)} />
  ),
}));
vi.mock("./ReviewFlashcardsPane", () => ({
  ReviewFlashcardDecks: () => <div />,
  ReviewFlashcardSession: () => <div />,
}));
vi.mock("./ReviewQuizPane", () => ({ default: () => <div /> }));
vi.mock("./ReviewMasteryOverview", () => ({ default: () => <div /> }));

import MobileTopBar from "@/components/layout/mobile/MobileTopBar";
import ReviewWorkspace from "./ReviewWorkspace";

describe("Review mobile left navigation", () => {
  beforeEach(() => {
    runtime.pathname = "/review";
    runtime.mobile = true;
    runtime.search = "";
    window.history.replaceState({}, "", "/review");
    useStore.setState({ mobileSidebarOpen: false, sidebarCollapsed: false });
    useOverlayStack.setState({ stack: [] });
  });
  afterEach(cleanup);

  it("opens the existing Review sidebar drawer and Esc closes it before the window layer", () => {
    const closeWindow = vi.fn();
    useOverlayStack.getState().register({ id: "review-window", priority: 30, onClose: closeWindow });
    render(<><MobileTopBar /><ReviewWorkspace /></>);
    const trigger = screen.getByTestId("mode-mobile-sidebar-toggle");

    fireEvent.click(trigger);
    expect(useStore.getState().mobileSidebarOpen).toBe(true);
    expect(screen.getByTestId("review-mobile-sidebar-backdrop")).toBeInTheDocument();
    expect(useOverlayStack.getState().stack.at(-1)?.id).toMatch(/^review-mobile-sidebar-/);
    expect(useOverlayStack.getState().stack.at(-1)?.priority).toBeGreaterThan(30);

    act(() => { useOverlayStack.getState().closeTop(); });
    expect(useStore.getState().mobileSidebarOpen).toBe(false);
    expect(screen.queryByTestId("review-mobile-sidebar-backdrop")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("keeps the note library under the mastery destination and out of the editor column", () => {
    runtime.mobile = false;
    runtime.search = "?section=overview";
    window.history.replaceState({}, "", "/review?section=overview");
    render(<ReviewWorkspace />);

    const mastery = screen.getByTestId("review-nav-overview");
    const tree = screen.getByTestId("year-subject-folder-tree");
    const library = screen.getByTestId("review-notes-list");
    expect(mastery.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("review-sidebar-auxiliary")).toContainElement(library);
    expect(screen.getByTestId("review-nav-overview")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("review-note-editor")).toBeNull();
    expect(screen.queryByTestId("review-sidebar-decks")).toBeNull();
  });

  it("selecting a note from another Review section opens notes, updates the URL, and closes the mobile drawer", () => {
    runtime.search = "?section=overview&note=previous-note";
    window.history.replaceState({}, "", "/review?section=overview&note=previous-note");
    render(<><MobileTopBar /><ReviewWorkspace /></>);
    const trigger = screen.getByTestId("mode-mobile-sidebar-toggle");
    fireEvent.click(trigger);
    expect(useStore.getState().mobileSidebarOpen).toBe(true);

    fireEvent.click(screen.getByTestId("select-review-note"));

    expect(screen.getByTestId("review-nav-notes")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("review-note-editor")).toHaveAttribute("data-note-id", "selected-from-library");
    expect(screen.getByTestId("review-note-editor")).toHaveAttribute("data-has-navigation", "false");
    expect(window.location.search).toContain("note=selected-from-library");
    expect(window.location.search).not.toContain("section=");
    expect(useStore.getState().mobileSidebarOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps flashcard deck filters alongside the always-available note library", () => {
    runtime.mobile = false;
    runtime.search = "?section=flashcards";
    window.history.replaceState({}, "", "/review?section=flashcards");
    render(<ReviewWorkspace />);

    expect(screen.getByTestId("review-nav-flashcards")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("review-notes-list")).toBeInTheDocument();
    expect(screen.getByTestId("year-subject-folder-tree")).toBeInTheDocument();
    expect(screen.getByTestId("review-sidebar-decks")).toBeInTheDocument();
  });
});
