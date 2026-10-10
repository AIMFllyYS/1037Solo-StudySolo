import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MobileBottomNav from "./MobileBottomNav";
import { useStore, type MobileTab } from "@/lib/stores/ui";

const TABS: MobileTab[] = ["detail", "review", "ai", "browser", "settings"];

describe("MobileBottomNav", () => {
  beforeEach(() => {
    useStore.setState({ mobileTab: "detail" });
  });
  afterEach(cleanup);

  it("renders five phone tabs in the required order", () => {
    render(<MobileBottomNav />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "详解",
      "复习",
      "AI",
      "浏览",
      "设置",
    ]);
    expect(buttons).toHaveLength(5);
    expect(document.querySelector(".mobile-nav-ai-mark")).toHaveTextContent("AI");
  });

  it("switches the mobile tab store", () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByRole("button", { name: "复习" }));
    expect(useStore.getState().mobileTab).toBe("review");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(useStore.getState().mobileTab).toBe("settings");
    expect(TABS).toContain(useStore.getState().mobileTab);
  });
});
