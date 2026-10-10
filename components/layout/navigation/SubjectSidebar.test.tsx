import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import SubjectSidebar from "./SubjectSidebar";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("SubjectSidebar year filter", () => {
  beforeEach(() => {
    localStorage.clear();
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
  });

  it("does not render the year switcher in the sidebar", () => {
    render(<SubjectSidebar />);
    expect(screen.queryByRole("group", { name: "切换学年" })).not.toBeInTheDocument();
  });

  it("default 大二上学期 hides 大一 subjects and shows the four medical books", () => {
    render(<SubjectSidebar />);
    expect(screen.getByText("系统解剖学")).toBeInTheDocument();
    expect(screen.getByText("医学细胞生物学")).toBeInTheDocument();
    expect(screen.getByText("生物化学与分子生物学")).toBeInTheDocument();
    expect(screen.getByText("组织学与胚胎学")).toBeInTheDocument();
    expect(screen.getByText("医学英语")).toBeInTheDocument();
    expect(screen.getByText("医学统计学")).toBeInTheDocument();
    expect(screen.getByText("细胞生物学实验")).toBeInTheDocument();
    expect(screen.queryByText("概率论与数理统计")).not.toBeInTheDocument();
    expect(screen.queryByText("大学物理")).not.toBeInTheDocument();
    expect(screen.queryByText("有机化学")).not.toBeInTheDocument();
    const order = [
      "医学英语",
      "仪器分析",
      "系统解剖学",
      "医学统计学",
      "细胞生物学实验",
      "医学细胞生物学",
      "组织学与胚胎学",
      "生物化学与分子生物学",
    ];
    for (let i = 1; i < order.length; i++) {
      const pos = screen.getByText(order[i - 1]).compareDocumentPosition(screen.getByText(order[i]));
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("store year change to 大一下学期 restores freshman subjects", () => {
    render(<SubjectSidebar />);
    act(() => {
      useAcademicYear.getState().setYear("freshman-2");
    });
    expect(screen.getByText("概率论与数理统计")).toBeInTheDocument();
    expect(screen.getByText("大学物理")).toBeInTheDocument();
    expect(screen.getByText("有机化学")).toBeInTheDocument();
    expect(screen.queryByText("系统解剖学")).not.toBeInTheDocument();
    expect(screen.queryByText("医学细胞生物学")).not.toBeInTheDocument();
    expect(screen.queryByText("医学英语")).not.toBeInTheDocument();
    expect(screen.queryByText("医学统计学")).not.toBeInTheDocument();
  });
});
