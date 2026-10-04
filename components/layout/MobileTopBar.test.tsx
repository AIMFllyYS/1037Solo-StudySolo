import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileTopBar from "./MobileTopBar";
import { useStore } from "@/lib/stores/ui";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/theme/appearance";
import { useTheme } from "@/lib/hooks/useTheme";
import { useAppMode } from "@/lib/stores/appMode";

const pathnameState = vi.hoisted(() => ({ value: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
  useRouter: () => ({ push: pathnameState.push }),
}));

vi.mock("@/lib/content-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-data")>();
  return {
    ...actual,
    getContentItem: () => ({ title: "课堂原文 · 第1-2节" }),
  };
});

vi.mock("@/lib/content-data/subjects.registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-data/subjects.registry")>();
  return {
    ...actual,
    subjectShortName: () => "组胚",
  };
});

describe("MobileTopBar", () => {
  beforeEach(() => {
    pathnameState.value = "/";
    pathnameState.push.mockClear();
    useAppMode.setState({ mode: "studio", lastStudioPath: "/" });
    useTheme.setState({
      theme: "light",
      hydrated: true,
      appearance: DEFAULT_APPEARANCE_SETTINGS,
    });
    useStore.setState({
      mobileSidebarOpen: false,
      mobileChapterPickerOpen: false,
      activeSubjectId: "histology",
      activeCategoryId: "recording",
      activeItemId: "rec-2026-fall-001-0002",
    });
  });
  afterEach(cleanup);

  it.each(["/", "/anatomy/detail/1.1", "/agent/pluginsevil"])("keeps the chapter title without a mode switcher on non-plugin route %s", (path) => {
    pathnameState.value = path;
    render(<MobileTopBar />);
    expect(screen.getByTestId("mobile-sidebar-toggle")).toHaveAccessibleName("展开导航");
    expect(screen.queryByTestId("app-mode-switcher")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-chapter-trigger")).toHaveTextContent("课堂原文 · 第1-2节");
    expect(screen.getByTestId("mobile-chapter-trigger")).not.toHaveTextContent("rec-2026");
  });

  it("opens the sidebar from the top-left control", () => {
    render(<MobileTopBar />);
    fireEvent.click(screen.getByTestId("mobile-sidebar-toggle"));
    expect(useStore.getState().mobileSidebarOpen).toBe(true);
  });
  it("shows plugin management without a course title and reuses the mode menu to return to Studio", () => {
    pathnameState.value = "/agent/plugins/mcp/google";
    useAppMode.setState({ mode: "agent", lastStudioPath: "/anatomy/detail/1.1" });
    render(<MobileTopBar />);
    expect(screen.queryByTestId("mobile-chapter-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-sidebar-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-mode-switcher")).toHaveTextContent("StudySolo · Agent");
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-studio"));
    expect(pathnameState.push).toHaveBeenCalledWith("/anatomy/detail/1.1");
  });

  it.each(["/class", "/review"])("shows one mode-owned navigation toggle on %s", (path) => {
    pathnameState.value = path;
    render(<MobileTopBar />);

    const toggle = screen.getByTestId("mode-mobile-sidebar-toggle");
    expect(toggle).toHaveAccessibleName("展开导航");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("mobile-sidebar-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-mode-switcher")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-chapter-trigger")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "展开导航" })).toHaveLength(1);
    fireEvent.click(toggle);
    expect(useStore.getState().mobileSidebarOpen).toBe(true);
    expect(screen.getByTestId("mode-mobile-sidebar-toggle")).toHaveAttribute("aria-expanded", "true");
  });
});
