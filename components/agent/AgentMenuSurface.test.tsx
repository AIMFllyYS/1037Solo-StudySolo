import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentMenuSurface } from "./AgentMenuSurface";

describe("AgentMenuSurface scrolling", () => {
  it("stays open while its overflowing menu scrolls and closes on an outside scroll", async () => {
    const onClose = vi.fn();
    render(
      <AgentMenuSurface id="scroll-test-menu" x={0} y={0} label="Resource actions" onClose={onClose}>
        {Array.from({ length: 24 }, (_, index) => (
          <button key={index} type="button" role="menuitem">{`Resource action ${index + 1}`}</button>
        ))}
      </AgentMenuSurface>,
    );

    const menu = await screen.findByRole("menu", { name: "Resource actions" });
    Object.defineProperties(menu, {
      clientHeight: { configurable: true, value: 160 },
      scrollHeight: { configurable: true, value: 720 },
    });
    menu.scrollTop = 180;
    fireEvent.scroll(menu);

    expect(menu).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const pageScroller = document.createElement("div");
    document.body.appendChild(pageScroller);
    try {
      fireEvent.scroll(pageScroller);
      expect(onClose).toHaveBeenCalledWith(false);
    } finally {
      pageScroller.remove();
    }
  });
});
