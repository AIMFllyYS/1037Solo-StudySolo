import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampBrowserZoomPercent,
  DEFAULT_BROWSER_ZOOM_PERCENT,
  parseBrowserPersist,
  parseBrowserViewMode,
} from "./browser.ts";

test("new browser preferences default to desktop while explicit legacy modes survive", () => {
  assert.equal(parseBrowserPersist(null).viewMode, "desktop");
  assert.equal(parseBrowserPersist(null).zoomPercent, 100);
  assert.equal(parseBrowserPersist(JSON.stringify({ viewMode: "mobile", browseUrl: "https://example.com" })).viewMode, "mobile");
  assert.equal(parseBrowserViewMode(undefined), "desktop");
  assert.equal(parseBrowserViewMode("mobile"), "mobile");
  assert.equal(parseBrowserViewMode("desktop"), "desktop");
  assert.equal(clampBrowserZoomPercent(Number.NaN), DEFAULT_BROWSER_ZOOM_PERCENT);
});

test("browser zoom stays in a bounded integer range", () => {
  assert.equal(clampBrowserZoomPercent(49), 50);
  assert.equal(clampBrowserZoomPercent(117.6), 118);
  assert.equal(clampBrowserZoomPercent(201), 200);
});
