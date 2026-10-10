import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { citeUserNoteToMainAgent, createAndOpenClassroomNote, createAndOpenNote, openAgentForUserNote, openArtifactImportPicker, openDocumentImportPicker, openFlashcardCitePicker, openNoteLibrary } from "@/lib/notes/openUserNote";
import { BLANK_NOTE_MARKDOWN, DEFAULT_NOTE_MARKDOWN, EXAMPLE_USER_NOTE_ID } from "@/lib/notes/userNote";
import { useAgentProductPicker } from "@/lib/stores/workspace/agentProductPicker";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useStore } from "@/lib/stores/ui";
import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";

beforeEach(() => {
  useUserNotes.setState({
    byId: {},
    order: [],
    openEditorIds: [],
    agentEditingNoteId: null,
    noteAgentOpenIds: [],
    noteAgentSessionById: {},
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
  });
  useFlashcardCitations.setState({ open: false, subjectId: null, activeCardId: null });
  useAgentProductPicker.setState({ open: false, kind: "document" });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useStore.setState({ activeSubjectId: DEFAULT_SUBJECT });
  useChatHistory.setState({
    sessionsMeta: [],
    messagesById: {},
    activeSessionId: "main",
    sessionLoadState: {},
    loadedSessionIds: [],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });
  useChatUI.getState().clearQuotedText();
});

test("createAndOpenNote uses the active subject when omitted", () => {
  const id = createAndOpenNote();
  assert.equal(useUserNotes.getState().byId[id]?.subjectId, DEFAULT_SUBJECT);
  assert.equal(useUserNotes.getState().byId[id]?.markdown, BLANK_NOTE_MARKDOWN);
  assert.doesNotMatch(useUserNotes.getState().byId[id]?.markdown ?? "", /案例笔记/);
  assert.notEqual(useUserNotes.getState().byId[id]?.markdown, DEFAULT_NOTE_MARKDOWN);
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "user-note-editor"));
});

test("createAndOpenClassroomNote writes a classroom sticky note with the quote", () => {
  useStore.setState({ activeSubjectId: "probability", activeCategoryId: "detail", activeItemId: "1.1" });
  const id = createAndOpenClassroomNote({
    quote: "泊松分布的均值等于方差",
    sourceKind: "agent",
    anchor: { x: 120, y: 160 },
  });
  assert.ok(id);
  const note = useUserNotes.getState().byId[id!];
  assert.equal(note?.kind, "classroom");
  assert.equal(note?.quote, "泊松分布的均值等于方差");
  assert.equal(note?.subjectId, "probability");
  assert.match(note?.source?.label ?? "", /Agent/);
  assert.deepEqual(useUserNotes.getState().openEditorIds, [id]);
  const win = useWindowManager.getState().windows.find((item) => item.data && "noteId" in item.data && item.data.noteId === id);
  assert.ok((win?.size.width ?? 999) <= 380);
});

test("createAndOpenNote can leave a note unfiled", () => {
  const id = createAndOpenNote(null);
  assert.equal(useUserNotes.getState().byId[id]?.subjectId, null);
});

test("openNoteLibrary defaults to the active subject in cite mode", () => {
  openNoteLibrary({ intent: "cite" });
  assert.equal(useUserNotes.getState().libraryOpen, true);
  assert.equal(useUserNotes.getState().libraryIntent, "cite");
  assert.equal(useUserNotes.getState().librarySubjectId, DEFAULT_SUBJECT);
  assert.equal(useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID]?.title, "案例笔记");
});

test("openFlashcardCitePicker defaults to the active subject", () => {
  openFlashcardCitePicker();
  assert.equal(useFlashcardCitations.getState().open, true);
  assert.equal(useFlashcardCitations.getState().subjectId, DEFAULT_SUBJECT);
});

test("createAndOpenNote on the bookshelf home stays unfiled", () => {
  const prev = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname: "/" } },
  });
  try {
    const id = createAndOpenNote();
    assert.equal(useUserNotes.getState().byId[id]?.subjectId, null);
  } finally {
    if (prev) Object.defineProperty(globalThis, "window", { configurable: true, value: prev });
    else delete (globalThis as { window?: unknown }).window;
  }
});

test("import pickers reuse one window and switch title with kind", () => {
  openDocumentImportPicker();
  assert.ok(useWindowManager.getState().windows.some((win) => win.title === "导入长文本"));
  openArtifactImportPicker();
  assert.equal(useWindowManager.getState().windows.filter((win) => win.type === "agent-product-picker").length, 1);
  assert.ok(useWindowManager.getState().windows.some((win) => win.title === "导入可交互 HTML"));
});

test("openAgentForUserNote opens an in-window note session and leaves the right panel alone", () => {
  const id = createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "# 被覆上皮\n\n旧稿" });
  useChatUI.getState().clearQuotedText();
  useStore.setState({ rightTab: "video", mobileTab: "detail", layoutProfile: "full" });
  useStore.getState().setRightCollapsedForProfile("full", true);
  const mainMessages = [{ id: "m1", role: "user" as const, timestamp: 1, parts: [{ type: "text" as const, text: "主对话" }] }];
  useChatHistory.setState({
    activeSessionId: "main",
    messagesById: { main: mainMessages },
    sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 1, artifactIds: [] }],
  });

  assert.equal(openAgentForUserNote(id), true);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, [id]);
  const sessionId = useUserNotes.getState().noteAgentSessionById[id];
  assert.ok(sessionId);
  assert.equal(useChatHistory.getState().sessionsMeta.find((item) => item.id === sessionId)?.kind, "note");
  assert.equal(useChatHistory.getState().activeSessionId, "main");
  assert.deepEqual(useChatHistory.getState().messagesById.main, mainMessages);
  assert.equal(useUserNotes.getState().agentEditingNoteId, null);
  assert.equal(useChatUI.getState().quotedText, null);
  assert.equal(useStore.getState().rightTab, "video");
  assert.equal(useStore.getState().mobileTab, "detail");
  assert.equal(useStore.getState().rightCollapsedByProfile.full, true);
});

test("citeUserNoteToMainAgent quotes into the right Agent and exposes updateUserNote", () => {
  const id = createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "# 被覆上皮\n\n旧稿" });
  useChatUI.getState().clearQuotedText();
  useStore.setState({ rightTab: "video", mobileTab: "detail", layoutProfile: "full" });
  useStore.getState().setRightCollapsedForProfile("full", true);

  assert.equal(citeUserNoteToMainAgent(id), true);
  assert.equal(useUserNotes.getState().agentEditingNoteId, id);
  assert.match(useChatUI.getState().quotedText ?? "", /【笔记】被覆上皮/);
  assert.match(useChatUI.getState().quotedText ?? "", /旧稿/);
  assert.equal(useStore.getState().rightTab, "ai");
  assert.equal(useStore.getState().mobileTab, "ai");
  assert.equal(useStore.getState().rightCollapsedByProfile.full, false);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, []);
});

test("openAgentForUserNote refuses a note that is not open", () => {
  const id = useUserNotes.getState().createNote("anatomy", { title: "关着", markdown: "旧" });
  assert.equal(openAgentForUserNote(id), false);
  assert.equal(useUserNotes.getState().agentEditingNoteId, null);
  assert.deepEqual(useUserNotes.getState().noteAgentOpenIds, []);
});

test("note editor AI button reuses the right-panel conversation icon", () => {
  const editor = readFileSync(new URL("../../components/notes/UserNoteEditorWindow.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../components/layout/RightPanel.tsx", import.meta.url), "utf8");
  assert.match(editor, /MessageSquare/);
  assert.match(panel, /MessageSquare/);
  assert.match(editor, /from "lucide-react"/);
  assert.match(panel, /from "lucide-react"/);
  assert.match(editor, /<MessageSquare size=\{14\} \/>/);
});

test("note and flashcard subject chips reuse AnchoredMenu", () => {
  const menu = readFileSync(new URL("../../components/notes/SubjectPickerMenu.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../../components/notes/UserNoteEditorWindow.tsx", import.meta.url), "utf8");
  const flashcards = readFileSync(new URL("../../components/notes/FlashcardCiteWindow.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../../components/review/RecordPreviewWindow.tsx", import.meta.url), "utf8");
  assert.match(menu, /from "@\/components\/ui\/AnchoredMenu"/);
  assert.match(menu, /className="app-menu-item"/);
  assert.match(editor, /SubjectPickerMenu/);
  assert.match(flashcards, /SubjectPickerMenu/);
  assert.match(preview, /SubjectPickerMenu/);
  assert.match(preview, /from "@\/components\/ui\/AnchoredMenu"/);
  assert.match(preview, /label="保留"/);
  assert.match(preview, /label="放弃"/);
  assert.match(preview, /data-testid="record-preview-export"/);
  assert.match(preview, /data-testid="record-preview-download-md"/);
  assert.match(preview, /data-testid="record-preview-delete"/);
});

test("import pickers open a shared agent-product window", () => {
  openDocumentImportPicker();
  assert.equal(useAgentProductPicker.getState().kind, "document");
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "agent-product-picker"));
  openArtifactImportPicker();
  assert.equal(useAgentProductPicker.getState().kind, "artifact");
  assert.equal(useWindowManager.getState().windows.filter((win) => win.type === "agent-product-picker").length, 1);
});
