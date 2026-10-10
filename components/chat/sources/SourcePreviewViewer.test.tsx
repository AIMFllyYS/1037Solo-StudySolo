import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SourcePreviewViewer from "./SourcePreviewViewer";
import { clearEmbedCache } from "@/lib/browser/canEmbed";
import { openSourcePreview } from "@/lib/chat/openSourcePreview";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useBrowser } from "@/lib/stores/workspace/browser";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 600, height: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  clearEmbedCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useBrowser.setState({ zoomPercent: 100 });
  delete (window as Window & { desktop?: unknown }).desktop;
});

describe("SourcePreviewViewer", () => {
  it("renders nothing when no source preview is open", () => {
    render(<SourcePreviewViewer />);
    expect(screen.queryByTestId("source-preview-window")).not.toBeInTheDocument();
  });

  it("embeds the page in an iframe and keeps 打开原页面 in the chrome", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ embeddable: true }) })));
    const open = vi.fn();
    vi.stubGlobal("open", open);
    openSourcePreview({ url: "https://example.edu/course", title: "大学课程" });
    render(<SourcePreviewViewer />);

    const frame = screen.getByTitle("大学课程");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://example.edu/course");
    await userEvent.click(screen.getByRole("button", { name: "打开原页面" }));
    expect(open).toHaveBeenCalledWith("https://example.edu/course", "_blank", "noopener,noreferrer");
  });

  it("shows a disaster-recovery panel when the site refuses to be embedded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ embeddable: false, reason: "X-Frame-Options: DENY" }) })),
    );
    openSourcePreview({ url: "https://blocked.example/x", title: "被拦截" });
    render(<SourcePreviewViewer />);

    await waitFor(() => {
      expect(screen.getByText("无法内嵌该页面")).toBeVisible();
    });
    expect(screen.getByText(/X-Frame-Options: DENY/)).toBeVisible();
    expect(screen.getByRole("link", { name: /打开原页面/ })).toHaveAttribute("href", "https://blocked.example/x");
    expect(screen.queryByTitle("被拦截")).not.toBeInTheDocument();
  });

  it("zooms only its own iframe, refreshes while preserving zoom, and resets the actual frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ embeddable: true }) })));
    useBrowser.setState({ zoomPercent: 150 });
    openSourcePreview({ url: "https://example.org/one", title: "One" });
    openSourcePreview({ url: "https://example.net/two", title: "Two" });
    render(<SourcePreviewViewer />);
    await act(async () => { await Promise.resolve(); });
    const initial = screen.getByTitle("One");
    const other = screen.getByTitle("Two");
    const trigger = within(initial.closest('[data-testid="source-preview-window"]') as HTMLElement).getByTestId("source-page-controls");
    expect(initial.style.width).toBe("600px");
    expect(initial.style.transform).toBe("scale(1)");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("source-zoom-out"));
    expect(initial.style.width).toBe(`${600 / 0.9}px`);
    expect(initial.style.transform).toBe("scale(0.9)");
    expect(other.style.width).toBe("600px");
    expect(other.style.transform).toBe("scale(1)");
    expect(useBrowser.getState().zoomPercent).toBe(150);
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("source-menu-refresh"));
    const refreshed = screen.getByTitle("One");
    expect(refreshed).not.toBe(initial);
    expect(refreshed).toHaveAttribute("src", "https://example.org/one");
    expect(refreshed.style.transform).toBe("scale(0.9)");
    expect(screen.getByTitle("Two")).toBe(other);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("source-zoom-reset"));
    expect(refreshed.style.width).toBe("600px");
    expect(refreshed.style.transform).toBe("scale(1)");
  });

  it("keeps same-origin pages in the fallback even after force-embed and disables page zoom", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ embeddable: true }) })));
    const url = `${window.location.origin}/public-document`;
    openSourcePreview({ url, title: "Same origin" });
    render(<SourcePreviewViewer />);
    expect(screen.queryByTitle("Same origin")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /仍要尝试内嵌/ }));
    expect(screen.queryByTitle("Same origin")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("source-page-controls"));
    expect(screen.getByTestId("source-zoom-in")).toBeDisabled();
    expect(screen.getByTestId("source-menu-refresh")).toBeDisabled();
    expect(screen.getByRole("link", { name: /打开原页面/ })).toHaveAttribute("href", url);
  });

  it("uses the native zoom/reload bridge and follows only the current safe page for external-open", () => {
    Object.defineProperty(window, "desktop", { configurable: true, value: { isElectron: true } });
    const zoom = vi.fn();
    const reload = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("open", open);
    Object.defineProperty(HTMLElement.prototype, "setZoomFactor", { configurable: true, value: zoom });
    Object.defineProperty(HTMLElement.prototype, "reload", { configurable: true, value: reload });
    try {
      openSourcePreview({ url: "https://example.org/native", title: "Native" });
      render(<SourcePreviewViewer />);
      const guest = document.querySelector("webview")!;
      expect(zoom).toHaveBeenLastCalledWith(1);
      fireEvent.click(screen.getByTestId("source-page-controls"));
      fireEvent.click(screen.getByTestId("source-zoom-in"));
      expect(zoom).toHaveBeenLastCalledWith(1.1);
      fireEvent.click(screen.getByTestId("source-page-controls"));
      fireEvent.click(screen.getByTestId("source-menu-refresh"));
      expect(reload).toHaveBeenCalledTimes(1);
      fireEvent(guest, Object.assign(new Event("did-navigate"), { url: "https://example.net/actual" }));
      fireEvent.click(screen.getByRole("button", { name: "打开原页面" }));
      expect(open).toHaveBeenLastCalledWith("https://example.net/actual", "_blank", "noopener,noreferrer");
      fireEvent(guest, Object.assign(new Event("did-navigate-in-page"), { url: "javascript:alert(1)" }));
      expect(screen.queryByRole("button", { name: "打开原页面" })).not.toBeInTheDocument();
    } finally {
      delete (HTMLElement.prototype as HTMLElement & { setZoomFactor?: unknown }).setZoomFactor;
      delete (HTMLElement.prototype as HTMLElement & { reload?: unknown }).reload;
    }
  });
});
