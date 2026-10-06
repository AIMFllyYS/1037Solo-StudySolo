import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserTab from "./BrowserTab";
import { BROWSE_TAB, useBrowser } from "@/lib/stores/browser";

const embed = vi.hoisted(() => ({ blocked: true }));
vi.mock("@/lib/hooks/useEmbeddable", () => ({
  useEmbeddable: () => ({ blocked: embed.blocked, reason: "X-Frame-Options: DENY", forceEmbed: vi.fn() }),
}));

describe("BrowserTab page controls", () => {
  beforeEach(() => {
    embed.blocked = true;
    useBrowser.setState({
      currentUrl: "https://example.com",
      browseUrl: "https://example.com",
      activeTabId: BROWSE_TAB,
      reloadNonce: 0,
      zoomPercent: 100,
      viewMode: "desktop",
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as Window & { desktop?: unknown }).desktop;
  });

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

  it("changes the iframe viewport and transform, resets both, and replaces the frame on refresh", () => {
    embed.blocked = false;
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: 600, height: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    });
    const view = render(<BrowserTab />);
    const initial = view.container.querySelector("iframe")!;
    expect(initial.style.width).toBe("600px");
    expect(initial.style.transform).toBe("scale(1)");

    fireEvent.click(screen.getByTestId("browser-page-controls"));
    fireEvent.click(screen.getByTestId("browser-zoom-out"));
    expect(initial.style.width).toBe(`${600 / 0.9}px`);
    expect(initial.style.height).toBe(`${400 / 0.9}px`);
    expect(initial.style.transform).toBe("scale(0.9)");

    fireEvent.click(screen.getByTestId("browser-page-controls"));
    fireEvent.click(screen.getByTestId("browser-zoom-reset"));
    expect(initial.style.width).toBe("600px");
    expect(initial.style.transform).toBe("scale(1)");
    fireEvent.click(screen.getByTestId("browser-page-controls"));
    fireEvent.click(screen.getByTestId("browser-menu-refresh"));
    expect(view.container.querySelector("iframe")).not.toBe(initial);
    expect(view.container.querySelector("iframe")?.src).toBe("https://example.com/");
  });

  it("external-open follows safe native navigation, ignores address edits, and returns to the selected page", () => {
    Object.defineProperty(window, "desktop", { configurable: true, value: { isElectron: true } });
    Object.defineProperty(HTMLElement.prototype, "loadURL", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    try {
      const view = render(<BrowserTab />);
      const guest = view.container.querySelector("webview")!;
      const external = view.container.querySelector("a[target='_blank']")!;
      fireEvent(guest, Object.assign(new Event("did-navigate"), { url: "https://example.org/current" }));
      expect(external).toHaveAttribute("href", "https://example.org/current");
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://typed.example" } });
      expect(external).toHaveAttribute("href", "https://example.org/current");
      fireEvent(guest, Object.assign(new Event("did-navigate-in-page"), { url: "javascript:alert(1)" }));
      expect(external).not.toHaveAttribute("href");
      expect(external).toHaveAttribute("aria-disabled", "true");
      act(() => useBrowser.getState().navigate("https://example.net/bookmark"));
      expect(external).toHaveAttribute("href", "https://example.net/bookmark");
    } finally {
      delete (HTMLElement.prototype as HTMLElement & { loadURL?: unknown }).loadURL;
    }
  });
});
