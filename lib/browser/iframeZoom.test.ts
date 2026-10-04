import assert from "node:assert/strict";
import { test } from "node:test";
import { computeIframeZoomLayout } from "./iframeZoom.ts";

test("mobile fit never enlarges its logical viewport to fill a wide panel", () => {
  const layout = computeIframeZoomLayout({
    containerWidth: 780,
    containerHeight: 700,
    logicalWidth: 390,
    zoomFactor: 1,
  });

  assert.equal(layout.fitScale, 1);
  assert.equal(layout.renderScale, 1);
  assert.equal(layout.iframeWidth, 390);
  assert.equal(layout.offsetLeft, 195);
});

test("narrow fit and user zoom reflow the iframe while preserving host bounds", () => {
  const normal = computeIframeZoomLayout({
    containerWidth: 300,
    containerHeight: 600,
    logicalWidth: 390,
    zoomFactor: 1,
  });
  const zoomed = computeIframeZoomLayout({
    containerWidth: 300,
    containerHeight: 600,
    logicalWidth: 390,
    zoomFactor: 1.2,
  });

  assert.ok(normal.fitScale < 1);
  assert.equal(normal.renderScale, normal.fitScale);
  assert.ok(zoomed.iframeWidth < normal.iframeWidth);
  assert.ok(Math.abs(zoomed.iframeWidth * zoomed.renderScale - 300) < 0.01);
  assert.ok(zoomed.iframeHeight < normal.iframeHeight);
});
