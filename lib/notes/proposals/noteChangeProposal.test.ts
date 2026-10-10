import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkProposalAgainstNote,
  isUsableOutput,
  markdownDigest,
  proposalFromToolOutput,
  type NoteChangeProposal,
} from "./noteChangeProposal.ts";
import type { UpdateUserNoteOutput } from "@/lib/ai/agent/tools/updateUserNote/types.ts";

function output(over: Partial<UpdateUserNoteOutput> = {}): UpdateUserNoteOutput {
  const base: UpdateUserNoteOutput = {
    text: "",
    proposalId: "p1",
    ok: true,
    noteId: "n1",
    markdown: "# 新稿",
    action: "update",
    sourceComplete: true,
    baseDigest: "",
    summary: "修改笔记「测试」",
  };
  return { ...base, ...over } as UpdateUserNoteOutput;
}

function proposal(over: Partial<NoteChangeProposal> = {}): NoteChangeProposal {
  const base: NoteChangeProposal = {
    id: "p1",
    sessionId: "s1",
    noteId: "n1",
    noteTitle: "测试",
    action: "update",
    markdown: "# 新稿",
    summary: "修改笔记「测试」",
    sourceComplete: true,
    baseDigest: markdownDigest("# 新稿"),
    createdAt: 1,
  };
  return { ...base, ...over } as NoteChangeProposal;
}

test("isUsableOutput rejects failed calls, empty targets and empty drafts", () => {
  assert.equal(isUsableOutput(output()), true);
  assert.equal(isUsableOutput(output({ ok: false })), false);
  assert.equal(isUsableOutput(output({ noteId: "" })), false);
  assert.equal(isUsableOutput(output({ summary: "" })), false);
  assert.equal(isUsableOutput(output({ markdown: "   " })), false);
  assert.equal(isUsableOutput(output({ action: "delete", markdown: "" })), true);
  assert.equal(isUsableOutput(undefined), false);
});

test("proposalFromToolOutput carries the base digest and truncation flag", () => {
  const built = proposalFromToolOutput(output({ baseDigest: markdownDigest("旧稿"), sourceComplete: false }), {
    sessionId: "s9",
    noteTitle: "解剖笔记",
  });
  assert.ok(built);
  assert.equal(built.id, "p1");
  assert.equal(built.sessionId, "s9");
  assert.equal(built.noteTitle, "解剖笔记");
  assert.equal(built.baseDigest, markdownDigest("旧稿"));
  assert.equal(built.sourceComplete, false);
  assert.equal(proposalFromToolOutput(output({ ok: false }), { sessionId: null }), null);
});

test("markdownDigest distinguishes content and survives equal timestamps", () => {
  assert.equal(markdownDigest("同一段"), markdownDigest("同一段"));
  assert.notEqual(markdownDigest("旧稿"), markdownDigest("新稿"));
  assert.notEqual(markdownDigest("ab"), markdownDigest("ba"));
  assert.notEqual(markdownDigest(""), markdownDigest(" "));
});

test("checkProposalAgainstNote blocks missing targets, truncated sources and moved text", () => {
  assert.deepEqual(checkProposalAgainstNote(proposal(), { markdown: "# 新稿" }), { ok: true });

  const missing = checkProposalAgainstNote(proposal(), undefined);
  assert.equal(missing.ok, false);
  assert.equal(missing.ok === false && missing.status, "stale");

  const truncated = checkProposalAgainstNote(proposal({ sourceComplete: false }), { markdown: "# 新稿" });
  assert.equal(truncated.ok, false);
  assert.equal(truncated.ok === false && truncated.status, "blocked");

  const moved = checkProposalAgainstNote(proposal({ baseDigest: markdownDigest("旧稿") }), { markdown: "# 新稿" });
  assert.equal(moved.ok, false);
  assert.equal(moved.ok === false && moved.status, "stale");

  // 正文未变 → 放行。
  assert.deepEqual(checkProposalAgainstNote(proposal({ baseDigest: markdownDigest("# 新稿") }), { markdown: "# 新稿" }), {
    ok: true,
  });
  // 没有指纹（旧消息 / 目录没带）→ 不阻断。
  assert.deepEqual(checkProposalAgainstNote(proposal({ baseDigest: "" }), { markdown: "任意" }), { ok: true });
});
