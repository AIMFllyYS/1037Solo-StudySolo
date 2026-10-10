import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileReviewHub from "./MobileReviewHub";
import { useStore } from "@/lib/stores/ui";
import { openFlashcardCitePicker, openNoteLibrary } from "@/lib/notes/openUserNote";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/notes/openUserNote", () => ({
  openNoteLibrary: vi.fn(),
  openFlashcardCitePicker: vi.fn(),
}));

describe("MobileReviewHub", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(openNoteLibrary).mockReset();
    vi.mocked(openFlashcardCitePicker).mockReset();
    useStore.setState({ activeSubjectId: "probability" });
  });
  afterEach(cleanup);

  it("opens note library or flashcard picker, and can enter the review board", () => {
    render(<MobileReviewHub />);
    fireEvent.click(screen.getByTestId("mobile-review-notes"));
    expect(openNoteLibrary).toHaveBeenCalledWith({ subjectId: "probability", intent: "browse" });
    fireEvent.click(screen.getByTestId("mobile-review-flashcards"));
    expect(openFlashcardCitePicker).toHaveBeenCalledWith({ subjectId: "probability" });
    fireEvent.click(screen.getByTestId("mobile-review-board"));
    expect(push).toHaveBeenCalledWith("/probability/review");
  });
});
