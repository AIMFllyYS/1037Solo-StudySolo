import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MembershipSponsorLayer from "./MembershipSponsorWindow";
import { openMembershipSponsor, GITHUB_REPO_URL, SPONSOR_EMAIL } from "@/lib/window/openMembershipSponsor";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

describe("MembershipSponsorWindow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  it("opens a Mac window with GitHub, email, and the sponsor code", () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    openMembershipSponsor();
    render(<MembershipSponsorLayer />);
    expect(screen.getByTestId("membership-sponsor-window")).toBeVisible();
    expect(screen.getByRole("link", { name: /GitHub 开源仓库/ })).toHaveAttribute("href", GITHUB_REPO_URL);
    expect(screen.getByRole("link", { name: new RegExp(SPONSOR_EMAIL) })).toHaveAttribute("href", `mailto:${SPONSOR_EMAIL}`);
    expect(screen.getByAltText("赞赏码")).toHaveAttribute("src", "/images/sponsor-wechat.png");
    expect(screen.getByText(/真实对你有帮助，欢迎来赞赏/)).toBeVisible();
  });
});
