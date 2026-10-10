import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpenUrlField, { parseOpenableUrl } from "./OpenUrlDialog";
import { SPOTLIGHT_INPUT_CLASS, SPOTLIGHT_SEARCH_FIELD_CLASS } from "@/components/search/spotlightChrome";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

afterEach(() => {
  cleanup();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

describe("parseOpenableUrl", () => {
  it("accepts bare hosts and html paths", () => {
    expect(parseOpenableUrl("example.com/course")).toMatchObject({
      href: "https://example.com/course",
      hostname: "example.com",
      isHtml: false,
    });
    expect(parseOpenableUrl("https://notes.example/page.html#sec")).toMatchObject({
      href: "https://notes.example/page.html#sec",
      isHtml: true,
    });
  });

  it("rejects empty or incomplete addresses", () => {
    expect(parseOpenableUrl("")).toBeNull();
    expect(parseOpenableUrl("   ")).toBeNull();
    expect(parseOpenableUrl("http://")).toBeNull();
  });
});

describe("OpenUrlField", () => {
  it("reuses the search input class and stays inline", () => {
    render(<OpenUrlField />);
    const input = screen.getByRole("textbox", { name: "网址" });
    expect(input).toHaveClass(...SPOTLIGHT_INPUT_CLASS.split(" "));
    expect(input.parentElement).toHaveClass(...SPOTLIGHT_SEARCH_FIELD_CLASS.split(" "));
    expect(screen.queryByRole("dialog", { name: "输入网址" })).not.toBeInTheDocument();
  });

  it("shows a validation error instead of opening a preview", () => {
    render(<OpenUrlField />);
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByText("请输入有效的 http:// 或 https:// 地址")).toBeInTheDocument();
    expect(useWindowManager.getState().windows).toHaveLength(0);
  });

  it("opens a source-preview window and notifies the parent", () => {
    const onOpened = vi.fn();
    render(<OpenUrlField onOpened={onOpened} />);
    fireEvent.change(screen.getByRole("textbox", { name: "网址" }), { target: { value: "example.com/course" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    const preview = useWindowManager.getState().windows.find((win) => win.type === "source-preview");
    expect(preview?.title).toBe("网址 · example.com");
    expect(preview?.data).toMatchObject({ url: "https://example.com/course" });
    expect(onOpened).toHaveBeenCalledOnce();
  });
});
