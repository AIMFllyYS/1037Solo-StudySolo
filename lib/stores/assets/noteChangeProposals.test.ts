import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { useNoteChangeProposals, sessionIdOfMessage } from "@/lib/stores/assets/noteChangeProposals";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useToast } from "@/lib/stores/toast";
import { markdownDigest, type NoteChangeProposal } from "@/lib/notes/noteChangeProposal";

function reset() {
  useNoteChangeProposals.getState().reset();
  useUserNotes.setState({
    byId: {},
    order: [],
    openEditorIds: [],
    dirtyEditorIds: [],
    agentEditingNoteId: null,
    noteAgentOpenIds: [],
    noteAgentSessionById: {},
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
  });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useToast.getState().clear();
  useChatHistory.setState({ messagesById: { main: [] }, activeSessionId: "main" });
}

beforeEach(reset);

function seedNote(markdown = "旧稿") {
  const id = useUserNotes.getState().createNote("anatomy", { title: "被覆上皮", markdown });
  return { id, digest: markdownDigest(markdown) };
}

function makeProposal(noteId: string, over: Partial<NoteChangeProposal> = {}): NoteChangeProposal {
  return {
    id: "p1",
    sessionId: "s1",
    noteId,
    noteTitle: "被覆上皮",
    action: "update",
    markdown: "# 新稿",
    summary: "修改笔记「被覆上皮」",
    sourceComplete: true,
    baseDigest: markdownDigest("旧稿"),
    createdAt: 1,
    ...over,
  };
}

test("ingest alone never writes to the note store", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));
  assert.equal(useUserNotes.getState().byId[id]?.markdown, "旧稿");
  assert.equal(useNoteChangeProposals.getState().statusOf("p1"), "pending");
});

test("approve applies once and is idempotent for repeat clicks", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));

  const first = useNoteChangeProposals.getState().approve("p1");
  assert.equal(first.ok, true);
  assert.equal(useUserNotes.getState().byId[id]?.markdown, "# 新稿");
  const afterFirst = useUserNotes.getState().byId[id]!.updatedAt;

  const second = useNoteChangeProposals.getState().approve("p1");
  assert.equal(second.ok, true);
  assert.equal(second.alreadyApplied, true);
  assert.equal(useUserNotes.getState().byId[id]?.updatedAt, afterFirst, "重放不得再次写入");
});

test("dismiss keeps the original note and never writes afterwards", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));
  useNoteChangeProposals.getState().dismiss("p1");

  assert.equal(useUserNotes.getState().byId[id]?.markdown, "旧稿");
  assert.equal(useNoteChangeProposals.getState().statusOf("p1"), "dismissed");

  const after = useNoteChangeProposals.getState().approve("p1");
  assert.equal(after.ok, false);
  assert.equal(useUserNotes.getState().byId[id]?.markdown, "旧稿");
});

test("approve refuses when the user edited the note after the draft was made", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));
  useUserNotes.getState().updateNote(id, { markdown: "用户后来自己写的新内容" });

  const result = useNoteChangeProposals.getState().approve("p1");
  assert.equal(result.ok, false);
  assert.equal(result.status, "stale");
  assert.equal(useUserNotes.getState().byId[id]?.markdown, "用户后来自己写的新内容");
  assert.equal(useNoteChangeProposals.getState().statusOf("p1"), "stale");
});

test("approve refuses a full replace built from a truncated source", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest, sourceComplete: false }));

  const result = useNoteChangeProposals.getState().approve("p1");
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(useUserNotes.getState().byId[id]?.markdown, "旧稿");
});

test("approve refuses to resurrect a deleted target", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));
  useUserNotes.getState().removeNote(id);

  const result = useNoteChangeProposals.getState().approve("p1");
  assert.equal(result.ok, false);
  assert.equal(result.status, "stale");
  assert.equal(useUserNotes.getState().byId[id], undefined);
});

test("approve deletes on a delete proposal", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(
    makeProposal(id, { action: "delete", markdown: "", baseDigest: digest, summary: "删除笔记「被覆上皮」" }),
  );

  const result = useNoteChangeProposals.getState().approve("p1");
  assert.equal(result.ok, true);
  assert.equal(useUserNotes.getState().byId[id], undefined);
});

test("approve still works when the candidate only changes the title", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals
    .getState()
    .ingest(makeProposal(id, { markdown: "旧稿", title: "新标题", baseDigest: digest }));

  const result = useNoteChangeProposals.getState().approve("p1");
  assert.equal(result.ok, true);
  assert.equal(useUserNotes.getState().byId[id]?.title, "新标题");
});

test("re-ingesting a historical result restores its ledger status instead of re-running it", () => {
  const { id, digest } = seedNote("旧稿");
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));
  useNoteChangeProposals.getState().approve("p1");

  useNoteChangeProposals.setState({ byId: {}, order: [] });
  useNoteChangeProposals.getState().ingest(makeProposal(id, { baseDigest: digest }));

  assert.equal(useNoteChangeProposals.getState().statusOf("p1"), "applied");
  const replay = useNoteChangeProposals.getState().approve("p1");
  assert.equal(replay.alreadyApplied, true);
});

test("two sessions handling different notes do not cross-apply", () => {
  const a = seedNote("A 旧稿");
  const b = useUserNotes.getState().createNote("physics", { title: "B 篇", markdown: "B 旧稿" });

  useNoteChangeProposals.getState().ingest(makeProposal(a.id, { id: "pa", baseDigest: a.digest }));
  useNoteChangeProposals
    .getState()
    .ingest(makeProposal(b, { id: "pb", sessionId: "s2", markdown: "B 新稿", baseDigest: markdownDigest("B 旧稿") }));

  useNoteChangeProposals.getState().approve("pa");
  assert.equal(useUserNotes.getState().byId[a.id]?.markdown, "# 新稿");
  assert.equal(useUserNotes.getState().byId[b]?.markdown, "B 旧稿");

  useNoteChangeProposals.getState().approve("pb");
  assert.equal(useUserNotes.getState().byId[b]?.markdown, "B 新稿");
});

test("sessionIdOfMessage resolves the owning session", () => {
  useChatHistory.setState({
    messagesById: { s1: [{ id: "m1", role: "assistant", timestamp: 1, parts: [] }] },
    activeSessionId: "s2",
  });
  assert.equal(sessionIdOfMessage("m1"), "s1");
  assert.equal(sessionIdOfMessage("nope"), "s2");
});
