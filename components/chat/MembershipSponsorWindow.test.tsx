import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MembershipSponsorLayer from "./MembershipSponsorWindow";
import { openMembershipSponsor, GITHUB_REPO_URL, SUPPORT_EMAIL } from "@/lib/window/openMembershipSponsor";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { fetchMembershipCatalog, parseMembershipCatalog } from "@/lib/membership/presentation";

const CATALOG = parseMembershipCatalog({
  plans: [
    { id: "free", storage_bytes: "1073741824", monthly_microcredits: "7000000" },
    { id: "pro", storage_bytes: "10737418240", monthly_microcredits: "20000000" },
    { id: "pro_plus", storage_bytes: "53687091200", monthly_microcredits: "50000000" },
    { id: "ultra", storage_bytes: "214748364800", monthly_microcredits: "100000000" },
  ],
  project_defaults: [],
  gift: null,
  payments: { live_enabled: false, checkout_available: false },
});

vi.mock("@/lib/membership/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/membership/presentation")>();
  return { ...actual, fetchMembershipCatalog: vi.fn() };
});

describe("MembershipSponsorWindow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  function open() {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    openMembershipSponsor();
    render(<MembershipSponsorLayer />);
  }

  it("explains the four tiers from the real catalog and links to the member center", async () => {
    vi.mocked(fetchMembershipCatalog).mockResolvedValue(CATALOG);
    open();
    expect(screen.getByTestId("membership-sponsor-window")).toBeVisible();
    for (const name of ["Free", "Pro", "Plus", "Ultra"]) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
    expect(screen.getByText("7 credits · 每 30 天发放", { exact: false })).toBeTruthy();
    expect(screen.getByText(/200 GiB/)).toBeTruthy();
    const center = screen.getByRole("link", { name: "前往统一会员中心" });
    expect(center.getAttribute("href")).toContain("/membership?");
    expect(center.getAttribute("href")).toContain("source=studysolo");
    expect(screen.getByRole("link", { name: /GitHub 开源仓库/ })).toHaveAttribute("href", GITHUB_REPO_URL);
    expect(screen.getByRole("link", { name: new RegExp(SUPPORT_EMAIL) })).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    // No QR / sponsor money request anywhere.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/赞赏/)).toBeNull();
    expect(screen.queryByText(/联系站长/)).toBeNull();
  });

  it("catalog outage shows an honest unavailable line, not fake tiers", async () => {
    vi.mocked(fetchMembershipCatalog).mockRejectedValue(new Error("down"));
    open();
    expect(await screen.findByText("暂时连不上统一会员中心，稍后再试。")).toBeTruthy();
    expect(screen.queryByText("Ultra")).toBeNull();
  });
});
