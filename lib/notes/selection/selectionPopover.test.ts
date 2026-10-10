import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SELECTION_POPOVER_SCROLL_GRACE_MS,
  shouldBlockFocusSteal,
  shouldIgnoreSelectionDismiss,
} from "@/lib/notes/selection/selectionPopover";

test("scroll dismiss is ignored during the virtualizer grace window", () => {
  assert.equal(shouldIgnoreSelectionDismiss(100, 200), true);
  assert.equal(shouldIgnoreSelectionDismiss(200, 200), false);
  assert.equal(shouldIgnoreSelectionDismiss(201, 200), false);
  assert.ok(SELECTION_POPOVER_SCROLL_GRACE_MS >= 300);
});

test("focus steal is blocked when the selection lives outside the target", () => {
  const outside = { isCollapsed: false, rangeCount: 1, anchorNode: { nodeType: 3 } };
  assert.equal(shouldBlockFocusSteal(outside, { nodeType: 1 }), true);
  assert.equal(shouldBlockFocusSteal({ isCollapsed: true, rangeCount: 1, anchorNode: null }, {}), false);
  assert.equal(shouldBlockFocusSteal(null, {}), false);
});
