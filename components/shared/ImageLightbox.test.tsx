import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageLightbox } from "./ImageLightbox";
import { useLightbox } from "@/lib/stores/workspace/lightbox";

/** store 是外部真相源：直接改它必须包 act，否则 React 19 不会同步重渲染。 */
function open(src: string, alt = "", options?: { toolbar?: "bottom" | "top-right" }) {
  act(() => {
    useLightbox.getState().open(src, alt, options);
  });
}

afterEach(() => {
  cleanup();
  act(() => useLightbox.getState().close());
  vi.restoreAllMocks();
});

describe("ImageLightbox", () => {
  it("renders nothing until an image is opened", () => {
    render(<ImageLightbox />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a toolbar with zoom in / zoom out / reset / download under the image", () => {
    render(<ImageLightbox />);
    open("https://img.example/a.png", "示意图");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("toolbar")).toBeVisible();
    expect(screen.getByLabelText("缩小")).toBeVisible();
    expect(screen.getByLabelText("放大")).toBeVisible();
    expect(screen.getByLabelText("重置")).toBeVisible();
    expect(screen.getByTestId("lightbox-download")).toBeVisible();
  });

  it("changes the zoom percentage when the toolbar buttons are used", () => {
    render(<ImageLightbox />);
    open("https://img.example/a.png");
    expect(screen.getByText("100%")).toBeVisible();
    fireEvent.click(screen.getByLabelText("放大"));
    expect(screen.getByText("120%")).toBeVisible();
    fireEvent.click(screen.getByLabelText("重置"));
    expect(screen.getByText("100%")).toBeVisible();
  });

  it("puts the toolbar in the top-right for the Mac-window variant", () => {
    render(<ImageLightbox />);
    open("https://img.example/a.png", "", { toolbar: "top-right" });
    expect(screen.getByRole("dialog")).toHaveAttribute("data-toolbar", "top-right");
  });

  it("downloads a data url through an anchor without fetching", () => {
    const click = vi.fn();
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = click;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      render(<ImageLightbox />);
      open("data:image/png;base64,AAA", "示意图");
      fireEvent.click(screen.getByTestId("lightbox-download"));
      expect(click).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
  });

  it("falls back to opening a new tab when the remote blob cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("cors"));
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ImageLightbox />);
    open("https://img.example/a.png");
    fireEvent.click(screen.getByTestId("lightbox-download"));
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled());
  });
});
