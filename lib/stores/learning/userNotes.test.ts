import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { selectClassroomNotes, selectLibraryNotes, useUserNotes } from "@/lib/stores/learning/userNotes";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import {
  BLANK_NOTE_MARKDOWN,
  DEFAULT_NOTE_MARKDOWN,
  EXAMPLE_USER_NOTE_ID,
  userNoteWindowId,
  USER_NOTE_LIBRARY_WINDOW_ID,
} from "@/lib/notes/userNote";
import { closeManagedWindow } from "@/lib/keyboard/windowActions";
import { stripUserNoteWindowState } from "@/lib/stores/workspace/windowPersist";
import { SAVED_TOAST_MESSAGE, useToast } from "@/lib/stores/toast";
import { activateStorageOwner, getStorageOwner } from "@/lib/storage/ownerScope";

const BODY_SEARCH_INDEX_DELAY_MS = 500;

function reset() {
  useUserNotes.setState({
    byId: {},
    order: [],
    libraryRevision: 0,
    openEditorIds: [],
    dirtyEditorIds: [],
    agentEditingNoteId: null,
    noteAgentOpenIds: [],
    noteAgentSessionById: {},
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
  });
  useFlashcardCitations.setState({ open: false, subjectId: null, activeCardId: null });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useToast.getState().clear();
  useChatHistory.setState({
    sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    messagesById: { main: [] },
    activeSessionId: "main",
    sessionLoadState: { main: "loaded" },
    loadedSessionIds: ["main"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });
}

beforeEach(reset);

test("createNote can seed an agent summary instead of a blank note", () => {
  const id = useUserNotes.getState().createNote("physics", {
    title: "牛顿定律",
    markdown: "# 牛顿定律\n\n$F=ma$",
  });
  const note = useUserNotes.getState().byId[id];
  assert.equal(note?.title, "牛顿定律");
  assert.equal(note?.markdown, "# 牛顿定律\n\n$F=ma$");
});

test("createNote binds subject and leaves a blank body", () => {
  const id = useUserNotes.getState().createNote("probability");
  const note = useUserNotes.getState().byId[id];
  assert.ok(note);
  assert.equal(note?.subjectId, "probability");
  assert.equal(note?.title, "无标题笔记");
  assert.equal(note?.markdown, BLANK_NOTE_MARKDOWN);
  assert.equal((note?.markdown ?? "").trim(), "");
  assert.doesNotMatch(note?.markdown ?? "", /\$E = mc\^\{2\}\$/);
  assert.notEqual(note?.id, EXAMPLE_USER_NOTE_ID);
});

test("ensureExampleNote seeds the case note once and skips existing libraries", () => {
  const first = useUserNotes.getState().ensureExampleNote();
  assert.equal(first, EXAMPLE_USER_NOTE_ID);
  const example = useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID];
  assert.equal(example?.title, "案例笔记");
  assert.equal(example?.markdown, DEFAULT_NOTE_MARKDOWN);
  assert.deepEqual(useUserNotes.getState().order, [EXAMPLE_USER_NOTE_ID]);

  assert.equal(useUserNotes.getState().ensureExampleNote(), EXAMPLE_USER_NOTE_ID);
  assert.deepEqual(useUserNotes.getState().order, [EXAMPLE_USER_NOTE_ID]);

  reset();
  const existing = useUserNotes.getState().createNote("physics", {
    title: "课堂备忘",
    markdown: "旧稿不要被案例覆盖",
  });
  assert.equal(useUserNotes.getState().ensureExampleNote(), null);
  assert.equal(useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID], undefined);
  assert.equal(useUserNotes.getState().byId[existing]?.markdown, "旧稿不要被案例覆盖");
});

test("openLibrary seeds the case note when empty", () => {
  useUserNotes.getState().openLibrary({ intent: "cite" });
  assert.equal(useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID]?.title, "案例笔记");
  assert.deepEqual(useUserNotes.getState().order, [EXAMPLE_USER_NOTE_ID]);
});

test("selectLibraryNotes can pin the case note under a subject filter", () => {
  useUserNotes.getState().ensureExampleNote();
  const classId = useUserNotes.getState().createNote("probability", {
    title: "泊松笔记",
    markdown: "泊松",
  });
  const filtered = selectLibraryNotes(useUserNotes.getState().byId, useUserNotes.getState().order, "probability");
  assert.deepEqual(filtered.map((note) => note.id), [classId]);
  const cited = selectLibraryNotes(
    useUserNotes.getState().byId,
    useUserNotes.getState().order,
    "probability",
    { includeExample: true },
  );
  assert.ok(cited.some((note) => note.id === classId));
  assert.ok(cited.some((note) => note.id === EXAMPLE_USER_NOTE_ID));
});

test("updateNote can refile the subject without touching markdown", () => {
  const id = useUserNotes.getState().createNote(null);
  const markdown = useUserNotes.getState().byId[id]?.markdown;
  useUserNotes.getState().updateNote(id, { subjectId: "probability" });
  assert.equal(useUserNotes.getState().byId[id]?.subjectId, "probability");
  assert.equal(useUserNotes.getState().byId[id]?.markdown, markdown);
  useUserNotes.getState().updateNote(id, { subjectId: null });
  assert.equal(useUserNotes.getState().byId[id]?.subjectId, null);
});

test("updateNote auto-follows heading until the title is edited by hand", () => {
  const id = useUserNotes.getState().createNote("physics");
  useUserNotes.getState().updateNote(id, { markdown: "# 牛顿定律\n\n$F=ma$" });
  assert.equal(useUserNotes.getState().byId[id]?.title, "牛顿定律");

  useUserNotes.getState().updateNote(id, { title: "力学笔记" });
  useUserNotes.getState().updateNote(id, { markdown: "# 别的标题\n\n正文" });
  assert.equal(useUserNotes.getState().byId[id]?.title, "力学笔记");
});

test("Review library indexing uses one trailing refresh and rejects work from an old owner", (t) => {
  const previousOwner = getStorageOwner();
  activateStorageOwner("review-index-owner-a");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    const id = useUserNotes.getState().createNote("probability");
    const afterCreate = useUserNotes.getState().libraryRevision;
    useUserNotes.getState().updateNote(id, { markdown: "# A\n\none" });
    assert.equal(useUserNotes.getState().libraryRevision, afterCreate);

    t.mock.timers.tick(300);
    useUserNotes.getState().updateNote(id, { markdown: "# AB\n\none" });
    t.mock.timers.tick(BODY_SEARCH_INDEX_DELAY_MS - 1);
    assert.equal(useUserNotes.getState().libraryRevision, afterCreate);
    t.mock.timers.tick(1);
    const finalLocalRevision = useUserNotes.getState().libraryRevision;
    assert.equal(finalLocalRevision, afterCreate + 1);

    // A remote merge writes the store directly; the same trailing index update
    // must make the final body searchable even when no later edit arrives.
    useUserNotes.setState((state) => ({
      byId: {
        ...state.byId,
        [id]: { ...state.byId[id]!, markdown: "# Remote final body", updatedAt: Date.now() + 1 },
      },
    }));
    t.mock.timers.tick(BODY_SEARCH_INDEX_DELAY_MS);
    assert.equal(useUserNotes.getState().libraryRevision, finalLocalRevision + 1);

    useUserNotes.setState((state) => ({
      byId: { ...state.byId, [id]: { ...state.byId[id]!, markdown: "owner A pending" } },
    }));
    const beforeOwnerChange = useUserNotes.getState().libraryRevision;
    activateStorageOwner("review-index-owner-b");
    t.mock.timers.tick(BODY_SEARCH_INDEX_DELAY_MS);
    assert.equal(useUserNotes.getState().libraryRevision, beforeOwnerChange);

    reset();
    const ownerBId = useUserNotes.getState().createNote("anatomy");
    const beforeOwnerBMerge = useUserNotes.getState().libraryRevision;
    useUserNotes.setState((state) => ({
      byId: {
        ...state.byId,
        [ownerBId]: { ...state.byId[ownerBId]!, markdown: "owner B remote final" },
      },
    }));
    t.mock.timers.tick(BODY_SEARCH_INDEX_DELAY_MS);
    assert.equal(useUserNotes.getState().libraryRevision, beforeOwnerBMerge + 1);
  } finally {
    activateStorageOwner(previousOwner);
  }
});

test("rehydrating old window fields does not keep editors or the library open", () => {
  const id = useUserNotes.getState().createNote("probability");
  useUserNotes.getState().openEditor(id);
  useUserNotes.getState().openLibrary({ intent: "browse" });
  useUserNotes.getState().setAgentEditingNoteId(id);
  useUserNotes.getState().setNoteAgentOpen(id, true);
  useUserNotes.setState({ dirtyEditorIds: [id] });
  stripUserNoteWindowState(useUserNotes.getState());
  useUserNotes.setState({
    openEditorIds: useUserNotes.getState().openEditorIds,
    dirtyEditorIds: useUserNotes.getState().dirtyEditorIds,
    libraryOpen: useUserNotes.getState().libraryOpen,
    agentEditingNoteId: useUserNotes.getState().agentEditingNoteId,
    noteAgentOpenIds: useUserNotes.getState().noteAgentOpenIds,
  });
  assert.deepEqual(useUserNotes.getState().openEditorIds, []);
  assert.deepEqual(useUserNotes.getState().dirtyEditorIds, []);
  assert.equal(useUserNotes.getState().libraryOpen, false);
  assert.equal(useUserNotes.getState().agentEditingNoteId, null);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, []);
  assert.ok(useUserNotes.getState().byId[id]);
});

test("openEditor opens a managed window and closeManagedWindow clears it", () => {
  const id = useUserNotes.getState().createNote("probability");
  useUserNotes.getState().openEditor(id);
  const winId = userNoteWindowId(id);
  const win = useWindowManager.getState().windows.find((item) => item.id === winId);
  assert.equal(win?.type, "user-note-editor");
  assert.deepEqual(win?.data, { noteId: id });
  assert.deepEqual(useUserNotes.getState().openEditorIds, [id]);

  useUserNotes.getState().setAgentEditingNoteId(id);
  closeManagedWindow(win!);
  assert.equal(useWindowManager.getState().windows.length, 0);
  assert.deepEqual(useUserNotes.getState().openEditorIds, []);
  assert.equal(useUserNotes.getState().agentEditingNoteId, null);
});

test("setLibrarySubjectId updates the library filter and window title", () => {
  useUserNotes.getState().openLibrary({ subjectId: "probability", intent: "browse" });
  useUserNotes.getState().setLibrarySubjectId("anatomy");
  assert.equal(useUserNotes.getState().librarySubjectId, "anatomy");
  assert.match(
    useWindowManager.getState().windows.find((item) => item.id === USER_NOTE_LIBRARY_WINDOW_ID)?.title ?? "",
    /系统解剖/,
  );
  useUserNotes.getState().setLibrarySubjectId(null);
  assert.equal(useUserNotes.getState().librarySubjectId, null);
  assert.equal(
    useWindowManager.getState().windows.find((item) => item.id === USER_NOTE_LIBRARY_WINDOW_ID)?.title,
    "笔记",
  );
});

test("openLibrary cite mode and closeManagedWindow", () => {
  useUserNotes.getState().openLibrary({ subjectId: "probability", intent: "cite" });
  const win = useWindowManager.getState().windows.find((item) => item.id === USER_NOTE_LIBRARY_WINDOW_ID);
  assert.equal(win?.type, "user-note-library");
  assert.equal(win?.title, "选择笔记");
  assert.equal(useUserNotes.getState().libraryIntent, "cite");
  closeManagedWindow(win!);
  assert.equal(useUserNotes.getState().libraryOpen, false);
});

test("ensureNoteAgentSession reuses one note-kind session and does not claim the main thread", () => {
  const id = useUserNotes.getState().createNote("anatomy", { title: "被覆上皮" });
  const first = useUserNotes.getState().ensureNoteAgentSession(id);
  const second = useUserNotes.getState().ensureNoteAgentSession(id);
  assert.ok(first);
  assert.equal(first, second);
  assert.equal(useChatHistory.getState().activeSessionId, "main");
  assert.equal(useChatHistory.getState().sessionsMeta.find((item) => item.id === first)?.kind, "note");
  useUserNotes.getState().setNoteAgentOpen(id, true);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, [id]);
  useUserNotes.getState().setNoteAgentOpen(id, false);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, []);
});

test("classroom notes stay out of the personal library and open as a sticky window", () => {
  const personal = useUserNotes.getState().createNote("probability", { title: "长笔记", markdown: "正文" });
  const classroom = useUserNotes.getState().createNote("probability", {
    kind: "classroom",
    quote: "泊松分布的均值等于方差",
    title: "泊松",
    markdown: "课上强调。",
    source: { kind: "agent", label: "概率论 · Agent" },
  });
  const mine = selectLibraryNotes(useUserNotes.getState().byId, useUserNotes.getState().order, "probability");
  const classNotes = selectClassroomNotes(useUserNotes.getState().byId, useUserNotes.getState().order, "probability");
  assert.deepEqual(mine.map((note) => note.id), [personal]);
  assert.deepEqual(classNotes.map((note) => note.id), [classroom]);
  assert.equal(useUserNotes.getState().byId[classroom]?.kind, "classroom");
  assert.equal(useUserNotes.getState().byId[classroom]?.quote, "泊松分布的均值等于方差");

  useUserNotes.getState().openEditor(classroom, { anchor: { x: 40, y: 80 } });
  const win = useWindowManager.getState().windows.find((item) => item.data && "noteId" in item.data && item.data.noteId === classroom);
  assert.equal(win?.type, "user-note-editor");
  assert.ok((win?.size.width ?? 999) <= 380);
  assert.ok((win?.size.height ?? 999) <= 360);
});

test("Review selection notes open the full workspace without changing other classroom sticky geometry", () => {
  const reviewNote = useUserNotes.getState().createNote("anatomy", {
    kind: "classroom",
    quote: "公开合成 Review 选区",
    source: { kind: "review", label: "系统解剖学 · 复习板", subjectId: "anatomy" },
  });
  useUserNotes.getState().openEditor(reviewNote, { anchor: { x: 400, y: 300 } });
  const reviewWindow = useWindowManager.getState().windows.find(
    (item) => item.data && "noteId" in item.data && item.data.noteId === reviewNote,
  );
  assert.ok((reviewWindow?.size.width ?? 0) >= 700);
  assert.ok((reviewWindow?.size.height ?? 0) >= 500);

  const classNote = useUserNotes.getState().createNote("anatomy", {
    kind: "classroom",
    quote: "公开合成 Class 选区",
    source: { kind: "class", label: "系统解剖学 · 课堂", subjectId: "anatomy" },
  });
  useUserNotes.getState().openEditor(classNote, { anchor: { x: 400, y: 300 } });
  const classWindow = useWindowManager.getState().windows.find(
    (item) => item.data && "noteId" in item.data && item.data.noteId === classNote,
  );
  assert.ok((classWindow?.size.width ?? 999) <= 380);
  assert.ok((classWindow?.size.height ?? 999) <= 360);
});

test("closing an edited note window toasts once; untouched close stays silent", () => {
  const id = useUserNotes.getState().createNote("probability", { title: "泊松", markdown: "初稿" });
  useUserNotes.getState().openEditor(id);
  useUserNotes.getState().closeEditor(id);
  assert.deepEqual(useToast.getState().toasts, []);

  useUserNotes.getState().openEditor(id);
  useUserNotes.getState().updateNote(id, { markdown: "改过的正文" });
  assert.deepEqual(useUserNotes.getState().dirtyEditorIds, [id]);
  useUserNotes.getState().closeEditor(id);
  assert.deepEqual(useUserNotes.getState().dirtyEditorIds, []);
  assert.deepEqual(useToast.getState().toasts.map((toast) => toast.message), [SAVED_TOAST_MESSAGE]);

  useToast.getState().clear();
  useUserNotes.getState().openEditor(id);
  useUserNotes.getState().closeEditor(id);
  assert.deepEqual(useToast.getState().toasts, []);
});

test("removeNote deletes the record and closes its editor", () => {
  const id = useUserNotes.getState().createNote(null);
  useUserNotes.getState().openEditor(id);
  const sessionId = useUserNotes.getState().ensureNoteAgentSession(id);
  useUserNotes.getState().setNoteAgentOpen(id, true);
  useUserNotes.getState().removeNote(id);
  assert.equal(useUserNotes.getState().byId[id], undefined);
  assert.equal(useWindowManager.getState().windows.length, 0);
  assert.equal(useUserNotes.getState().noteAgentSessionById[id], undefined);
  assert.ok(!useChatHistory.getState().sessionsMeta.some((item) => item.id === sessionId));
});

test("flashcard cite picker opens a singleton window", () => {
  useFlashcardCitations.getState().openPicker({ subjectId: "probability" });
  const win = useWindowManager.getState().windows.find((item) => item.type === "flashcard-cite-picker");
  assert.ok(win);
  assert.match(win?.title ?? "", /复习闪卡页面/);
  useFlashcardCitations.getState().setSubjectId(null);
  assert.equal(useFlashcardCitations.getState().subjectId, null);
  assert.equal(
    useWindowManager.getState().windows.find((item) => item.type === "flashcard-cite-picker")?.title,
    "复习闪卡页面",
  );
  closeManagedWindow(win!);
  assert.equal(useFlashcardCitations.getState().open, false);
});
