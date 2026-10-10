import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AcademicYearSwitcher from "./AcademicYearSwitcher";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { ACADEMIC_YEAR_STORAGE_KEY, DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

describe("AcademicYearSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
  });

  it("shows 大一–大五 and the current semester pair", () => {
    render(<AcademicYearSwitcher />);
    expect(screen.getByRole("group", { name: "切换学年" })).toBeInTheDocument();
    for (const label of ["大一", "大二", "大三", "大四", "大五"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "大二上学期" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "大二下学期" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "大二" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "大二上学期" })).toHaveAttribute("aria-checked", "true");
  });

  it("persists the selected year and marks aria-checked", async () => {
    const user = userEvent.setup();
    render(<AcademicYearSwitcher />);
    await user.click(screen.getByRole("radio", { name: "大一" }));
    await user.click(screen.getByRole("radio", { name: "大一下学期" }));
    expect(useAcademicYear.getState().year).toBe("freshman-2");
    expect(localStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)).toBe("freshman-2");
    expect(screen.getByRole("radio", { name: "大一" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "大一下学期" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "大一上学期" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the current term when jumping to an empty later year", async () => {
    const user = userEvent.setup();
    render(<AcademicYearSwitcher />);
    await user.click(screen.getByRole("radio", { name: "大三" }));
    expect(useAcademicYear.getState().year).toBe("junior-1");
    expect(screen.getByRole("radio", { name: "大三" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "大三上学期" })).toHaveAttribute("aria-checked", "true");
  });
});
