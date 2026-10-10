import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomeBookshelf from "./HomeBookshelf";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("HomeBookshelf year filter", () => {
  beforeEach(() => {
    localStorage.clear();
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
  });

  it("大二上学期只显示大二新书", () => {
    render(<HomeBookshelf />);
    expect(screen.getByText("系统解剖学")).toBeInTheDocument();
    expect(screen.getByText("医学细胞生物学")).toBeInTheDocument();
    expect(screen.getByText("仪器分析")).toBeInTheDocument();
    expect(screen.getByText("医学英语")).toBeInTheDocument();
    expect(screen.getByText("医学统计学")).toBeInTheDocument();
    expect(screen.getByText("细胞生物学实验")).toBeInTheDocument();
    expect(screen.queryByText("概率论与数理统计")).not.toBeInTheDocument();
    expect(screen.queryByText("大学物理")).not.toBeInTheDocument();
  });

  it("切换学年 to 大一下学期 restores freshman books", async () => {
    const user = userEvent.setup();
    render(<HomeBookshelf />);
    await user.click(screen.getByRole("radio", { name: "大一" }));
    await user.click(screen.getByRole("radio", { name: "大一下学期" }));
    expect(screen.getByText("概率论与数理统计")).toBeInTheDocument();
    expect(screen.getByText("有机化学")).toBeInTheDocument();
    expect(screen.queryByText("系统解剖学")).not.toBeInTheDocument();
    expect(screen.queryByText("医学英语")).not.toBeInTheDocument();
    expect(screen.queryByText("医学统计学")).not.toBeInTheDocument();
  });

  it("空学期显示空书架说明", async () => {
    const user = userEvent.setup();
    render(<HomeBookshelf />);
    await user.click(screen.getByRole("radio", { name: "大三" }));
    expect(screen.getByText("这一学期还没有课程")).toBeInTheDocument();
    expect(screen.queryByText("系统解剖学")).not.toBeInTheDocument();
  });

  it("科目卡片提供笔记入口并打开该科笔记库", async () => {
    const user = userEvent.setup();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    useUserNotes.setState({
      byId: {},
      order: [],
      openEditorIds: [],
      libraryOpen: false,
      libraryIntent: "browse",
      librarySubjectId: null,
    });
    render(<HomeBookshelf />);
    const card = screen.getByText("系统解剖学").closest("[data-subject-id]");
    expect(card).not.toBeNull();
    await user.click(within(card as HTMLElement).getByRole("button", { name: "笔记" }));
    expect(useUserNotes.getState().libraryOpen).toBe(true);
    expect(useUserNotes.getState().libraryIntent).toBe("browse");
    expect(useUserNotes.getState().librarySubjectId).toBe("anatomy");
    expect(useWindowManager.getState().windows.some((win) => win.type === "user-note-library")).toBe(true);
  });
});
