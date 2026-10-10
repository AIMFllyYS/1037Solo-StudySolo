import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";
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

    assert.deepEqual(orderAgentDockWindows(windows, "middle").map((window) => window.id), [
      "middle",
      "newest",
      "older",
    ]);
  });

  it("shows three windows and leaves every remaining window reachable in overflow", () => {
    const windows = [dockWindow("a", 1), dockWindow("b", 2), dockWindow("c", 3), dockWindow("d", 4), dockWindow("e", 5)];
    const result = splitAgentDockWindows(windows, "e");

    assert.deepEqual(result.visible.map((window) => window.id), ["e", "d", "c"]);
    assert.deepEqual(result.overflow.map((window) => window.id), ["b", "a"]);
    assert.equal(windows.length, 5);
  });
});
