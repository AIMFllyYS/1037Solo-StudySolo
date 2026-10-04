import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebviewSite from "./WebviewSite";

const setZoomFactor = vi.fn();

describe("WebviewSite zoom", () => {
  beforeEach(() => {
    setZoomFactor.mockReset();
    Object.defineProperty(HTMLElement.prototype, "setZoomFactor", {
      configurable: true,
      value: setZoomFactor,
    });
  });
  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as HTMLElement & { setZoomFactor?: (factor: number) => void }).setZoomFactor;
  });

  it("applies only the explicit BrowserTab zoom prop", async () => {
    const view = render(<WebviewSite url="https://example.com" zoomFactor={1.25} />);
    await waitFor(() => expect(setZoomFactor).toHaveBeenCalledWith(1.25));

    view.rerender(<WebviewSite url="https://example.com" />);
    expect(setZoomFactor).toHaveBeenCalledTimes(1);
  });

  it("does not force a default zoom on shared WebviewSite callers", async () => {
    render(<WebviewSite url="https://example.com" />);
    await Promise.resolve();
    expect(setZoomFactor).not.toHaveBeenCalled();
  });
});
