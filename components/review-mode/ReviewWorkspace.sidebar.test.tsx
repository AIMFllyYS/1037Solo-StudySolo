import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/lib/stores/ui";
import { useOverlayStack } from "@/lib/keyboard/useOverlayStack";

const runtime = vi.hoisted(() => ({ pathname: "/review", mobile: true }));

vi.mock("next/navigation", () => ({
  usePathname: () => runtime.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => runtime.mobile }));
vi.mock("./ReviewNotesPane", () => ({
  ReviewNotesList: () => <div data-testid="review-notes-list" />,
  ReviewNoteEditor: () => <div data-testid="review-note-editor" />,
}));
vi.mock("./ReviewFlashcardsPane", () => ({
  ReviewFlashcardDecks: () => <div />,
  ReviewFlashcardSession: () => <div />,
}));
vi.mock("./ReviewQuizPane", () => ({ default: () => <div /> }));
vi.mock("./ReviewMasteryOverview", () => ({ default: () => <div /> }));

import MobileTopBar from "@/components/layout/MobileTopBar";
import ReviewWorkspace from "./ReviewWorkspace";

describe("Review mobile left navigation", () => {
  beforeEach(() => {
    runtime.pathname = "/review";
    runtime.mobile = true;
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
});
