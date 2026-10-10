import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { openSourcePreview, sourcePreviewWindowId } from "./openSourcePreview.ts";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

afterEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

test("openSourcePreview opens one window per URL and reuses it on a second click", () => {
  openSourcePreview({ url: "https://example.edu/a", title: "课程 A" });
  openSourcePreview({ url: "https://example.edu/b", title: "课程 B" });
  assert.equal(
    useWindowManager.getState().windows.filter((win) => win.type === "source-preview").length,
    2,
  );

  const id = sourcePreviewWindowId("https://example.edu/a");
  useWindowManager.getState().minimizeWindow(id);
  openSourcePreview({ url: "https://example.edu/a", title: "课程 A 更新" });
  const again = useWindowManager.getState().windows.find((win) => win.id === id);
  assert.equal(again?.minimized, false);
  assert.equal(again?.title, "课程 A 更新");
  assert.equal(
    useWindowManager.getState().windows.filter((win) => win.type === "source-preview").length,
    2,
  );
});
