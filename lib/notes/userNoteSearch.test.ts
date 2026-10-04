import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserNote } from "./userNote.ts";
import {
  carryUserNoteSearchFields,
  getUserNoteSearchFields,
  userNoteMatchesQuery,
} from "./userNoteSearch.ts";

function note(patch: Partial<UserNote> = {}): UserNote {
  return {
    id: "search-note",
    title: "泊松分布",
    markdown: "# 泊松分布\n均值等于方差",
    subjectId: "probability",
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

test("full-text cache matches normalized title/body and remains lazy for empty queries", () => {
  const first = note();
  assert.equal(userNoteMatchesQuery(first, ""), true);
  assert.equal(userNoteMatchesQuery(first, "方差"), true);
  assert.equal(userNoteMatchesQuery(first, "牛顿"), false);
  const fields = getUserNoteSearchFields(first);
  assert.equal(fields.title, "泊松分布");
  assert.equal(fields.markdown, "# 泊松分布\n均值等于方差");
});

test("metadata-only replacements carry the body index; one Markdown edit invalidates only that note", () => {
  const original = note();
  const originalFields = getUserNoteSearchFields(original);
  const refiled = { ...original, subjectId: "anatomy", updatedAt: 2 };
  carryUserNoteSearchFields(original, refiled);
  assert.equal(getUserNoteSearchFields(refiled).markdown, originalFields.markdown);

  const edited = { ...refiled, markdown: "# 新标题\n组织上皮" };
  carryUserNoteSearchFields(refiled, edited);
  assert.equal(userNoteMatchesQuery(edited, "组织上皮"), true);
  assert.equal(userNoteMatchesQuery(edited, "均值等于方差"), false);
  assert.equal(userNoteMatchesQuery(original, "均值等于方差"), true);
});
