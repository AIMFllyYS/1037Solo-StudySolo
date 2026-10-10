import { afterEach, describe, expect, it } from "vitest";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { toggleManagedWindowFullscreen } from "@/lib/window/toggleManagedFullscreen";

afterEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  document.getElementById(NOTES_PANEL_ID)?.remove();
});

describe("toggleManagedWindowFullscreen", () => {
  it("snaps to the notes panel and restores preExpand geometry", () => {
    const el = document.createElement("div");
    el.id = NOTES_PANEL_ID;
    el.getBoundingClientRect = () =>
      ({
        left: 80, top: 40, width: 640, height: 480,
        right: 720, bottom: 520, x: 80, y: 40, toJSON: () => {},
      }) as DOMRect;
    document.body.appendChild(el);

    useWindowManager.getState().openWindow({
      id: "win-fs",
      type: "source-preview",
      title: "预览",
      pos: { x: 12, y: 24 },
      size: { width: 400, height: 300 },
      data: { url: "https://example.com", title: "预览" },
    });

    toggleManagedWindowFullscreen("win-fs", "notes");
    const opened = useWindowManager.getState().windows[0];
    expect(opened?.fullscreen).toBe(true);
    expect(opened?.pos).toEqual({ x: 80, y: 40 });
    expect(opened?.size).toEqual({ width: 640, height: 480 });

    toggleManagedWindowFullscreen("win-fs", "notes");
    const restored = useWindowManager.getState().windows[0];
    expect(restored?.fullscreen).toBe(false);
    expect(restored?.pos).toEqual({ x: 12, y: 24 });
    expect(restored?.size).toEqual({ width: 400, height: 300 });
  });
});
