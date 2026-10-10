import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EDITING_NOTE_CONTEXT_MAX_CHARS,
  formatEditingUserNoteContext,
  isEditingNoteComplete,
} from "./editingUserNote.ts";

test("formatEditingUserNoteContext asks for a candidate draft, not an automatic write", () => {
  const text = formatEditingUserNoteContext({
    id: "note_1",
    title: "被覆上皮",
    markdown: "# 被覆上皮\n\n1. 分类",
  });
  assert.match(text, /正在编辑的个人笔记/);
  assert.match(text, /id=note_1/);
  assert.match(text, /被覆上皮/);
  assert.match(text, /updateUserNote/);
  assert.match(text, /1\. 分类/);
  assert.match(text, /不要调用 commitNotes 或 writeDocument 另起一篇|不要另起一篇/);
  assert.match(text, /同意修改/);
  assert.match(text, /不要声称已经保存、修改或删除/);
  // 旧规则必须消失：它明确鼓励 Agent 自行改稿。
  assert.doesNotMatch(text, /不必等学生再点一次/);
  assert.doesNotMatch(text, /先正常输出分析/);
});

test("formatEditingUserNoteContext truncates long markdown and forbids a full replace", () => {
  const text = formatEditingUserNoteContext({
    id: "note_long",
    title: "",
    markdown: "字".repeat(EDITING_NOTE_CONTEXT_MAX_CHARS + 20),
  });
  assert.match(text, /无标题笔记/);
  assert.match(text, /正文过长/);
  assert.match(text, /不要提交整篇替换/);
  assert.ok(text.length < EDITING_NOTE_CONTEXT_MAX_CHARS + 700);
});

test("isEditingNoteComplete only passes a source the model actually read in full", () => {
  assert.equal(isEditingNoteComplete("短"), true);
  assert.equal(isEditingNoteComplete("字".repeat(EDITING_NOTE_CONTEXT_MAX_CHARS)), true);
  assert.equal(isEditingNoteComplete("字".repeat(EDITING_NOTE_CONTEXT_MAX_CHARS + 1)), false);
});
