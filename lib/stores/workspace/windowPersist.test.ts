import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_USER_NOTE_WINDOW_STATE, stripOpenIds, stripUserNoteWindowState, stripViewerId } from "./windowPersist.ts";

test("stripUserNoteWindowState drops old persisted editor/library windows", () => {
  const state = stripUserNoteWindowState({
    openEditorIds: ["note-a", "note-b"],
    dirtyEditorIds: ["note-a"],
    libraryOpen: true,
    agentEditingNoteId: "note-a",
    noteAgentOpenIds: ["note-a"],
    byId: { "note-a": { id: "note-a" } },
  });
  assert.equal(state.openEditorIds?.length, 0);
  assert.deepEqual(state.dirtyEditorIds, []);
  assert.equal(state.libraryOpen, false);
  assert.equal(state.agentEditingNoteId, null);
  assert.deepEqual(state.noteAgentOpenIds, []);
  assert.equal(state.byId?.["note-a"]?.id, "note-a");
  state.openEditorIds?.push("later");
  assert.deepEqual(EMPTY_USER_NOTE_WINDOW_STATE.openEditorIds, []);
});

test("stripViewerId and stripOpenIds are idempotent", () => {
  const viewer = stripViewerId({ viewerId: "doc-1", byId: { "doc-1": true } });
  assert.equal(viewer.viewerId, null);
  assert.equal(stripViewerId(viewer).viewerId, null);
  const gens = stripOpenIds({ openIds: ["img-1", "img-1"], sessions: { "img-1": {} } });
  assert.deepEqual(gens.openIds, []);
  assert.deepEqual(stripOpenIds(gens).openIds, []);
});
