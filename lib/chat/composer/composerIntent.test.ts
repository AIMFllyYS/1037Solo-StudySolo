import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPOSER_COMPACT_LABEL,
  FORCED_TOOL_LABELS,
  NOTEBOOK_FILE_MIME,
  filePathOf,
  formatForcedToolLine,
  mergeAttachedFiles,
  normalizeAttachedFile,
  parseFilePath,
  readNotebookFileDrag,
  resolveForcedToolName,
  skillForcedTool,
  writeNotebookFileDrag,
} from "./composerIntent.ts";

test("composerIntent：path 与强制工具映射", () => {
  assert.equal(filePathOf("probability", "detail", "1.4"), "probability/detail/1.4");
  assert.deepEqual(parseFilePath("probability/detail/1.4"), {
    subjectId: "probability",
    categoryId: "detail",
    itemId: "1.4",
  });
  assert.equal(normalizeAttachedFile({ path: "bad" }), null);
  assert.equal(resolveForcedToolName("generateImage"), "generateImage");
  assert.equal(resolveForcedToolName("flashcards"), "proposeMemory");
  assert.equal(resolveForcedToolName("flashcards", { memoryCommit: "flashcards" }), "commitFlashcards");
  assert.equal(resolveForcedToolName("notes"), "proposeMemory");
  assert.equal(resolveForcedToolName("notes", { editingUserNote: { id: "n1" } }), "updateUserNote");
  assert.equal(resolveForcedToolName(skillForcedTool("s1")), "useSkill");
  assert.match(formatForcedToolLine("generateImage"), /generateImage/);
  assert.match(formatForcedToolLine(skillForcedTool("s1"), "速记"), /速记/);
  assert.equal(FORCED_TOOL_LABELS.writeDocument, "生成长文");
  assert.equal(FORCED_TOOL_LABELS.renderInteractive, "可交互网页");
  assert.equal(FORCED_TOOL_LABELS.flashcards, "整理闪卡");
  assert.equal(FORCED_TOOL_LABELS.notes, "整理笔记");
  assert.equal(COMPOSER_COMPACT_LABEL, "压缩上下文");
});

test("composerIntent：拖拽 payload 与去重", () => {
  const file = normalizeAttachedFile({
    path: "probability/detail/1.4",
    title: "古典概型",
    address: "概率论 › 详解 › 古典概型",
  })!;
  const store: Record<string, string> = {};
  const dt = {
    setData: (type: string, value: string) => { store[type] = value; },
    getData: (type: string) => store[type] ?? "",
    types: [NOTEBOOK_FILE_MIME, "text/plain"],
    effectAllowed: "none",
  };
  writeNotebookFileDrag(dt as unknown as DataTransfer, [file]);
  assert.ok(store[NOTEBOOK_FILE_MIME]);
  const read = readNotebookFileDrag(dt as unknown as DataTransfer);
  assert.equal(read[0]?.path, "probability/detail/1.4");
  const merged = mergeAttachedFiles([file], [file, { ...file, path: "probability/detail/1.5", itemId: "1.5", title: "条件概率" }]);
  assert.equal(merged.length, 2);
});
