import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditorShortcut, keepEditorShortcut } from "./editorShortcuts.ts";

test("isEditorShortcut 识别复制粘贴撤销", () => {
  assert.equal(isEditorShortcut({ key: "c", metaKey: true, ctrlKey: false, altKey: false }), true);
  assert.equal(isEditorShortcut({ key: "V", metaKey: false, ctrlKey: true, altKey: false }), true);
  assert.equal(isEditorShortcut({ key: "z", metaKey: true, ctrlKey: false, altKey: false }), true);
  assert.equal(isEditorShortcut({ key: "c", metaKey: false, ctrlKey: false, altKey: false }), false);
  assert.equal(isEditorShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: false }), false);
});

test("keepEditorShortcut 只拦截编辑快捷键的冒泡", () => {
  let stopped = 0;
  keepEditorShortcut({
    key: "c",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    stopPropagation: () => {
      stopped += 1;
    },
  });
  keepEditorShortcut({
    key: "s",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    stopPropagation: () => {
      stopped += 1;
    },
  });
  assert.equal(stopped, 1);
});
