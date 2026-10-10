import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAttachedFilesVolatile, formatComposerVolatile } from "./attachedFilesContext.ts";

test("attachedFilesContext：附加文件带详细地址，计划模式写进易变段", () => {
  const attached = formatAttachedFilesVolatile([{
    path: "probability/detail/1.4",
    title: "古典概型与几何概型",
    kind: "file",
    address: "概率论与数理统计 › 详解 › 随机事件与概率 › 古典概型与几何概型",
    subjectId: "probability",
    categoryId: "detail",
    itemId: "1.4",
  }]);
  assert.match(attached, /用户附加的笔记/);
  assert.match(attached, /probability\/detail\/1\.4/);
  assert.match(attached, /古典概型/);

  const folder = formatAttachedFilesVolatile([{
    path: "probability/detail/ch01",
    title: "随机事件与概率",
    kind: "folder",
    address: "概率论与数理统计 › 详解 › 随机事件与概率",
    subjectId: "probability",
    categoryId: "detail",
    itemId: "ch01",
    childPaths: ["probability/detail/1.4"],
  }]);
  assert.match(folder, /子项 path/);
  assert.doesNotMatch(folder, /【古典/);

  const plan = formatComposerVolatile({
    planMode: true,
    forcedTool: "generateImage",
    attachedFiles: [],
  });
  assert.match(plan, /计划模式/);
  assert.doesNotMatch(plan, /指定工具/);
});
