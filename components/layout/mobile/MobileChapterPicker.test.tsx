import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileChapterPicker from "./MobileChapterPicker";
import { useStore } from "@/lib/stores/ui";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

vi.mock("@/lib/content-data/nav", () => ({
  navTree: {
    subjects: [
      {
        id: "histology",
        name: "组织学与胚胎学",
        categories: [
          {
            id: "recording",
            name: "课上录音",
            items: [
              {
                id: "ch01",
                title: "第1-2节·绪论与上皮组织",
                children: [
                  { id: "rec-2026-fall-001-0002", title: "课堂原文 · 第1-2节" },
                  { id: "note-rec-2026-fall-001-0002", title: "课堂笔记 · 第1-2节" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}));

vi.mock("@/lib/constants/academic-year", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants/academic-year")>();
  return {
    ...actual,
    filterSubjectsByYear: <T,>(subjects: T[]) => subjects,
  };
});

vi.mock("@/lib/content-data/subjects.registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-data/subjects.registry")>();
  return {
    ...actual,
    subjectName: () => "组织学与胚胎学",
  };
});

describe("MobileChapterPicker", () => {
  beforeEach(() => {
    push.mockReset();
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
    useStore.setState({
      mobileChapterPickerOpen: true,
      activeSubjectId: "histology",
      activeCategoryId: "recording",
      activeItemId: "rec-2026-fall-001-0002",
    });
  });
  afterEach(cleanup);

  it("shows human titles only and stays open after selecting a file", () => {
    render(<MobileChapterPicker />);
    expect(screen.getByTestId("mobile-chapter-picker")).toBeInTheDocument();
    expect(screen.getByText("课堂原文 · 第1-2节")).toBeInTheDocument();
    expect(screen.queryByText(/rec-2026-fall/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("课堂原文 · 第1-2节"));
    expect(push).toHaveBeenCalledWith("/histology/recording/rec-2026-fall-001-0002");
    expect(useStore.getState().mobileChapterPickerOpen).toBe(true);
    expect(screen.getByTestId("mobile-chapter-picker")).toBeInTheDocument();
  });

  it("closes from X or the outside backdrop", () => {
    render(<MobileChapterPicker />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(useStore.getState().mobileChapterPickerOpen).toBe(false);
  });

  it("portals the sheet onto document.body so the shell cannot clip it", () => {
    render(
      <div data-testid="fake-shell" style={{ overflow: "hidden", transform: "translateX(0)" }}>
        <MobileChapterPicker />
      </div>,
    );
    const picker = screen.getByTestId("mobile-chapter-picker");
    const backdrop = screen.getByTestId("mobile-chapter-backdrop");
    expect(picker.parentElement).toBe(document.body);
    expect(backdrop.parentElement).toBe(document.body);
    expect(screen.getByTestId("fake-shell")).not.toContainElement(picker);
  });
});
