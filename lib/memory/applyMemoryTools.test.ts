import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { applyCommitFlashcards, applyCommitNotes } from "./applyMemoryTools.ts";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useStore } from "@/lib/stores/ui";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";

beforeEach(() => {
  useUserNotes.setState({
    byId: {},
    order: [],
    openEditorIds: [],
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
  });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useStore.setState({ activeSubjectId: DEFAULT_SUBJECT });
  useReviewCards.setState({ byId: {}, order: [], _hasHydrated: true });
  useRecordPreviews.setState({ previews: [] });
});

afterEach(() => {
  useReviewCards.setState({ byId: {}, order: [], _hasHydrated: true });
  useRecordPreviews.setState({ previews: [] });
});

test("applyCommitNotes writes a short note and opens the editor", () => {
  const id = applyCommitNotes({
    text: "ok",
    noteId: "note_x",
    title: "渗透压",
    markdown: "# 渗透压\n\n- 定义：$\\Pi = cRT$",
  });
  const note = useUserNotes.getState().byId[id];
  assert.equal(note?.title, "渗透压");
  assert.match(note?.markdown ?? "", /cRT/);
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "user-note-editor"));
});

test("applyCommitFlashcards writes review cards and opens the preview", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  try {
    const ids = applyCommitFlashcards({
      text: "ok",
      cardIds: ["card_x"],
      mode: "cloze",
      items: [{ originalText: "渗透压是溶液的依数性" }],
    });
    assert.equal(ids.length, 1);
    const card = useReviewCards.getState().byId[ids[0]!];
    assert.match(card?.originalText ?? "", /渗透压/);
    assert.ok(useWindowManager.getState().windows.some((win) => win.type === "record-preview"));
    assert.ok(useRecordPreviews.getState().previews.length >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
