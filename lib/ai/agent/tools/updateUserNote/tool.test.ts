import assert from "node:assert/strict";
import { test } from "node:test";
import { createUpdateUserNoteTool } from "./tool.ts";
import type { UpdateUserNoteOutput } from "./types.ts";
import type { StudyToolContext } from "@/lib/ai/agent/tools/_shared.ts";
import { EDITING_NOTE_CONTEXT_MAX_CHARS } from "@/lib/notes/editor/editingUserNote.ts";
import { markdownDigest } from "@/lib/notes/proposals/noteChangeProposal.ts";

const execOpts = {
  toolCallId: "u1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

function ctx(over: Partial<StudyToolContext> = {}): StudyToolContext {
  return {
    subjectId: "anatomy",
    categoryId: "detail",
    itemId: "1.1",
    skills: [],
    academicYear: "sophomore-1",
    userNotes: [],
    flashcards: [],
    ...over,
  };
}

test("updateUserNote proposes a change to the open note and never claims it is written", async () => {
  const tool = createUpdateUserNoteTool(
    ctx({
      editingUserNote: { id: "note_open", title: "被覆上皮", markdown: "旧稿", updatedAt: 1234 },
    }),
  );
  const result = (await tool.execute!(
    { markdown: "# 被覆上皮\n\n1. 分类", title: "上皮组织" },
    execOpts,
  )) as UpdateUserNoteOutput;

  assert.equal(result.ok, true);
  assert.equal(result.proposalId, "u1");
  assert.equal(result.noteId, "note_open");
  assert.equal(result.action, "update");
  assert.equal(result.markdown, "# 被覆上皮\n\n1. 分类");
  assert.equal(result.title, "上皮组织");
  assert.equal(result.baseDigest, markdownDigest("旧稿"));
  assert.equal(result.sourceComplete, true);
  assert.match(result.summary, /修改笔记「被覆上皮」/);
  assert.match(result.summary, /上皮组织/);
  // 模型看到的文案必须表达「等同意」，不能表达「已写回」。
  assert.match(result.text, /等学生在前端点/);
  assert.doesNotMatch(result.text, /已写回/);
});

test("updateUserNote refuses when no personal note is open or listed", async () => {
  const tool = createUpdateUserNoteTool(ctx());
  const result = (await tool.execute!({ markdown: "# 新稿" }, execOpts)) as UpdateUserNoteOutput;
  assert.equal(result.ok, false);
  assert.equal(result.noteId, "");
  assert.equal(result.summary, "");
  assert.match(result.text, /没有可改写的个人笔记/);
});

test("updateUserNote proposes update or delete for a catalog note by id", async () => {
  const tool = createUpdateUserNoteTool(
    ctx({
      userNotes: [
        {
          id: "n2",
          title: "骨学",
          markdown: "旧",
          subjectId: "anatomy",
          updatedAt: 7,
          markdownDigest: markdownDigest("旧"),
        },
      ],
    }),
  );
  const updated = (await tool.execute!(
    { noteId: "n2", markdown: "# 长骨" },
    execOpts,
  )) as UpdateUserNoteOutput;
  assert.equal(updated.ok, true);
  assert.equal(updated.noteId, "n2");
  assert.equal(updated.markdown, "# 长骨");
  // 主对话按目录 id 改稿时，指纹来自目录项（客户端按该笔记正文算出）。
  assert.equal(updated.baseDigest, markdownDigest("旧"));

  const removed = (await tool.execute!({ noteId: "n2", action: "delete" }, execOpts)) as UpdateUserNoteOutput;
  assert.equal(removed.ok, true);
  assert.equal(removed.action, "delete");
  assert.equal(removed.noteId, "n2");
  assert.match(removed.summary, /删除笔记「骨学」/);
});

test("updateUserNote marks a truncated source so the client can refuse a full replace", async () => {
  const long = "字".repeat(EDITING_NOTE_CONTEXT_MAX_CHARS + 1);
  const openTool = createUpdateUserNoteTool(
    ctx({ editingUserNote: { id: "note_long", title: "长笔记", markdown: long } }),
  );
  const openResult = (await openTool.execute!({ markdown: "# 整篇重写" }, execOpts)) as UpdateUserNoteOutput;
  assert.equal(openResult.sourceComplete, false);

  const catalogTool = createUpdateUserNoteTool(
    ctx({
      userNotes: [
        { id: "n3", title: "目录长笔记", markdown: "x".repeat(10), subjectId: "anatomy", updatedAt: 9, truncated: true },
      ],
    }),
  );
  const catalogResult = (await catalogTool.execute!(
    { noteId: "n3", markdown: "# 整篇重写" },
    execOpts,
  )) as UpdateUserNoteOutput;
  assert.equal(catalogResult.sourceComplete, false);
});

test("updateUserNote derives a stable proposalId when the runtime gives no toolCallId", async () => {
  const tool = createUpdateUserNoteTool(
    ctx({ editingUserNote: { id: "note_open", title: "篇", markdown: "旧稿" } }),
  );
  const first = (await tool.execute!({ markdown: "# 新稿" }, {} as never)) as UpdateUserNoteOutput;
  const second = (await tool.execute!({ markdown: "# 新稿" }, {} as never)) as UpdateUserNoteOutput;
  assert.ok(first.proposalId);
  assert.equal(first.proposalId, second.proposalId);
});
