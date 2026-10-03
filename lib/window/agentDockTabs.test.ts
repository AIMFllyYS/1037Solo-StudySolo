import { describe, expect, it } from "vitest";
import type { ManagedWindow } from "@/lib/hooks/useWindowManager";
import { orderAgentDockWindows, splitAgentDockWindows } from "./agentDockTabs";

function dockWindow(id: string, z: number): ManagedWindow {
  return {
    id,
    type: "source-preview",
    title: id,
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    z,
    fullscreen: false,
    minimized: false,
    sessionId: "session-a",
    data: { url: "https://example.test", title: id },
  };
}

describe("Agent resource tabs", () => {
  it("keeps the active window first and sorts the rest by their most recent activation", () => {
    const windows = [dockWindow("older", 2), dockWindow("newest", 8), dockWindow("middle", 5)];

    expect(orderAgentDockWindows(windows, "middle").map((window) => window.id)).toEqual([
      "middle",
      "newest",
      "older",
    ]);
  });

  it("shows three windows and leaves every remaining window reachable in overflow", () => {
    const windows = [dockWindow("a", 1), dockWindow("b", 2), dockWindow("c", 3), dockWindow("d", 4), dockWindow("e", 5)];
    const result = splitAgentDockWindows(windows, "e");

    expect(result.visible.map((window) => window.id)).toEqual(["e", "d", "c"]);
    expect(result.overflow.map((window) => window.id)).toEqual(["b", "a"]);
    expect(windows).toHaveLength(5);
  });
});
