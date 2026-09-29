import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginOverlay from "./LoginOverlay";
import { useStore } from "@/lib/stores/ui";
import GlobalSettings from "@/components/layout/GlobalSettings";
import { useTheme } from "@/lib/hooks/useTheme";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/theme/appearance";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("LoginOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ loginOverlayOpen: false, agentSettingsOpen: false });
    useTheme.setState({
      theme: "dark",
      hydrated: true,
      appearance: DEFAULT_APPEARANCE_SETTINGS,
    });
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
  });

  afterEach(() => {
    cleanup();
    useStore.setState({ loginOverlayOpen: false });
  });

  it("stays closed until the store opens a centered overlay", () => {
    const { rerender } = render(<LoginOverlay />);
    expect(screen.queryByTestId("login-overlay")).toBeNull();
    useStore.setState({ loginOverlayOpen: true });
    rerender(<LoginOverlay />);
    const dialog = screen.getByRole("dialog", { name: "登录 StudySolo" });
    expect(dialog).toHaveClass("login-dialog");
    expect(dialog.closest("[data-testid=login-overlay]")).toHaveClass("login-overlay");
    expect(screen.getByRole("heading", { name: "使用 1037Solo 统一账号" })).toBeInTheDocument();
  });

  it("closes from the backdrop and the close button", async () => {
    const user = userEvent.setup();
    useStore.setState({ loginOverlayOpen: true });
    const { rerender } = render(<LoginOverlay />);
    fireEvent.mouseDown(screen.getByTestId("login-overlay"));
    expect(useStore.getState().loginOverlayOpen).toBe(false);

    useStore.setState({ loginOverlayOpen: true });
    rerender(<LoginOverlay />);
    await user.click(screen.getByRole("button", { name: "关闭登录" }));
    expect(useStore.getState().loginOverlayOpen).toBe(false);
  });

  it("opens from the settings 登录 button instead of routing away", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor } as React.RefObject<HTMLButtonElement>;
    render(<GlobalSettings anchorRef={anchorRef} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(onClose).toHaveBeenCalled();
    expect(useStore.getState().loginOverlayOpen).toBe(true);
  });
});
