import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SELECTION_ASSISTANT_ACTIONS,
  hasVisibleSelectionActions,
  isSelectionActionVisible,
  normalizeSelectionAssistantActions,
  shouldPreventForeignSelectionMenu,
} from "./selectionAssistant.ts";

test("normalizeSelectionAssistantActions：缺省全开，只接受已知布尔字段", () => {
  assert.deepEqual(normalizeSelectionAssistantActions(undefined), DEFAULT_SELECTION_ASSISTANT_ACTIONS);
  assert.deepEqual(normalizeSelectionAssistantActions({ quote: false, extra: true }), {
    ...DEFAULT_SELECTION_ASSISTANT_ACTIONS,
    quote: false,
  });
});

test("划词动作可见性：全关则不弹出；单项可关", () => {
  assert.equal(isSelectionActionVisible(undefined, "note"), true);
  assert.equal(isSelectionActionVisible({ ...DEFAULT_SELECTION_ASSISTANT_ACTIONS, note: false }, "note"), false);
  assert.equal(hasVisibleSelectionActions({
    copy: false, explain: false, record: false, note: false, ask: false, quote: false,
  }), false);
  assert.equal(hasVisibleSelectionActions({ ...DEFAULT_SELECTION_ASSISTANT_ACTIONS, quote: false }), true);
});

test("系统划词菜单：仅在开启拦截且有非空选区时阻止", () => {
  assert.equal(shouldPreventForeignSelectionMenu(true, { isCollapsed: false, rangeCount: 1 }), true);
  assert.equal(shouldPreventForeignSelectionMenu(true, { isCollapsed: true, rangeCount: 1 }), false);
  assert.equal(shouldPreventForeignSelectionMenu(false, { isCollapsed: false, rangeCount: 1 }), false);
  assert.equal(shouldPreventForeignSelectionMenu(true, null), false);
});
