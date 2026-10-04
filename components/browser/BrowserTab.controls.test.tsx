import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserTab from "./BrowserTab";
import { BROWSE_TAB, useBrowser } from "@/lib/stores/browser";

vi.mock("@/lib/hooks/useEmbeddable", () => ({
  useEmbeddable: () => ({ blocked: true, reason: "X-Frame-Options: DENY", forceEmbed: vi.fn() }),
}));

describe("BrowserTab page controls", () => {
  beforeEach(() => {
    useBrowser.setState({
      currentUrl: "https://example.com",
      browseUrl: "https://example.com",
      activeTabId: BROWSE_TAB,
      reloadNonce: 0,
      zoomPercent: 100,
      viewMode: "desktop",
    });
  });
  afterEach(cleanup);

  it("zooms in, resets to 100%, and refreshes from the accessible menu", () => {
    render(<BrowserTab />);
    const openMenu = () => fireEvent.click(screen.getByTestId("browser-page-controls"));

    openMenu();
    fireEvent.click(screen.getByTestId("browser-zoom-in"));
    expect(useBrowser.getState().zoomPercent).toBe(110);
    expect(screen.getByTestId("browser-page-controls")).toHaveFocus();

    openMenu();
    fireEvent.click(screen.getByTestId("browser-zoom-reset"));
    expect(useBrowser.getState().zoomPercent).toBe(100);

    openMenu();
    fireEvent.click(screen.getByTestId("browser-menu-refresh"));
    expect(useBrowser.getState().reloadNonce).toBe(1);
  });
});
