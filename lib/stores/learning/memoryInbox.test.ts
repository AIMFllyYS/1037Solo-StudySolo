import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetMemoryInboxSessionAcks, syncMemoryInboxFromSessions, useMemoryInbox } from "./memoryInbox.ts";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useStore } from "@/lib/stores/ui";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { setNoteCommitRunnerForTests, type RunNoteCommitInput } from "@/lib/memory/runNoteCommit";
import {
  setMemoryCommitRunnerForTests,
  type RunMemoryCommitInput,
} from "@/lib/memory/runMemoryCommit";
import { createAssistantPlaceholder } from "@/lib/chat/messageParts";
import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import type { ChatMessage } from "@/lib/types/chat";
import type { RecordMode } from "@/lib/review/types";
import { activateStorageOwner } from "@/lib/storage/ownerScope";

function assistantWithParts(id: string, parts: ChatMessage["parts"], timestamp = 1): ChatMessage {
  return { id, role: "assistant", parts, timestamp };
}

function noteCommitMessage(title: string): ChatMessage {
  return {
    ...createAssistantPlaceholder("side-a", {}),
    parts: [
      {
        type: "tool-commitNotes",
        toolCallId: "c1",
        state: "output-available",
        input: { title, markdown: "1. 定义" },
        output: { text: "ok", noteId: "note_c1", title, markdown: "1. 定义" },
      },
    ],
  };
}

/** confirm → sessionForMessage（全量读）→ runMemoryCommit 是多段 await：宏任务一轮排空整条微任务链。 */
async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function flashcardCommitMessage(mode: RecordMode): ChatMessage {
  return {
    ...createAssistantPlaceholder("side-f", {}),
    parts: [
      {
        type: "tool-commitFlashcards",
        toolCallId: "cf1",
        state: "output-available",
        input: { mode, items: [{ originalText: "渗透压是溶液的依数性" }] },
        output: {
          text: "ok",
          cardIds: ["card_cf1_1"],
          mode,
          items: [{ originalText: "渗透压是溶液的依数性" }],
        },
      },
    ],
  };
}

test("a delayed note commit cannot write after the storage owner changes", async () => {
  let finish: ((message: ChatMessage) => void) | undefined;
  setMemoryCommitRunnerForTests(() => new Promise((resolve) => { finish = resolve; }));
  useMemoryInbox.getState().ingestProposal({ proposalId: "owner-switch-public", kind: "note", reason: "公开测试", messageId: "m1", toolCallId: "p-owner", sessionId: "main" });
  useMemoryInbox.getState().confirm("owner-switch-public");
  await flushAsync();
  assert.ok(finish);
  activateStorageOwner("55555555-5555-4555-8555-555555555555");
  finish(noteCommitMessage("公开测试延迟结果"));
  await flushAsync();
  assert.equal(useUserNotes.getState().order.length, 0);
  assert.equal(useMemoryInbox.getState().order.length, 0);
  activateStorageOwner(null);
});

beforeEach(() => {
  useMemoryInbox.setState({ byId: {}, order: [], appliedCommitIds: [], seenProposalIds: [] });
  resetMemoryInboxSessionAcks();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useStore.setState({ outbound: null, activeSubjectId: DEFAULT_SUBJECT, activeCategoryId: "detail", activeItemId: "1.1" });
  useUserNotes.setState({
    byId: {},
    order: [],
    openEditorIds: [],
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
  });
  useChatHistory.setState({
    activeSessionId: "main",
    messagesById: {
      main: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "什么是渗透压？" }], timestamp: 1 },
        { id: "m1", role: "assistant", parts: [{ type: "text", text: "定义清楚了" }], timestamp: 2 },
      ],
    },
  });
  useReviewCards.setState({ byId: {}, order: [], _hasHydrated: true });
  useRecordPreviews.setState({ previews: [] });
  setNoteCommitRunnerForTests(async (input: RunNoteCommitInput) => {
    const assistant = noteCommitMessage(input.title || "课堂要点");
    input.onWrite(assistant);
    return assistant;
  });
});

afterEach(() => {
  setNoteCommitRunnerForTests(null);
  setMemoryCommitRunnerForTests(null);
});

test("historical propose/commit on first session look do not reopen clouds or rewrite notes", () => {
  const noteId = useUserNotes.getState().createNote("probability", { title: "已有笔记", markdown: "旧稿" });
  useUserNotes.getState().closeEditor(noteId);
  const history = [
    assistantWithParts("old-a", [
      {
        type: "tool-proposeMemory",
        toolCallId: "t-old",
        state: "output-available",
        input: { kind: "note", reason: "旧对话" },
        output: { text: "提议", proposalId: "prop_old", kind: "note", reason: "旧对话", titleHint: "渗透压" },
      },
      {
        type: "tool-commitNotes",
        toolCallId: "c-old",
        state: "output-available",
        input: { title: "渗透压", markdown: "新稿" },
        output: { text: "ok", noteId: "note_dup", title: "渗透压", markdown: "新稿" },
      },
    ]),
  ];
  syncMemoryInboxFromSessions({ main: history });
  syncMemoryInboxFromSessions({ main: history });
  assert.deepEqual(useMemoryInbox.getState().order, []);
  assert.ok(useMemoryInbox.getState().seenProposalIds.includes("prop_old"));
  assert.ok(useMemoryInbox.getState().appliedCommitIds.includes("c-old"));
  assert.equal(useWindowManager.getState().windows.length, 0);
  assert.deepEqual(useUserNotes.getState().order, [noteId]);
  assert.deepEqual(useUserNotes.getState().openEditorIds, []);
});

test("live proposeMemory after a session is acknowledged still opens one cloud", () => {
  syncMemoryInboxFromSessions({ main: [] });
  syncMemoryInboxFromSessions({
    main: [
      assistantWithParts("m-live", [
        {
          type: "tool-proposeMemory",
          toolCallId: "t-live",
          state: "output-available",
          input: { kind: "note", reason: "刚讲清" },
          output: { text: "提议", proposalId: "prop_live", kind: "note", reason: "刚讲清", titleHint: "渗透压" },
        },
      ], 2),
    ],
  });
  assert.deepEqual(useMemoryInbox.getState().order, ["prop_live"]);
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
});

test("orphan historical commit is remembered and does not open a record book", () => {
  useMemoryInbox.getState().ingestCommit({
    toolCallId: "c-orphan",
    messageId: "m1",
    kind: "flashcard",
    flashcards: {
      text: "ok",
      cardIds: ["card_x"],
      mode: "cloze",
      items: [{ originalText: "渗透压是溶液的依数性" }],
    },
  });
  assert.deepEqual(useMemoryInbox.getState().appliedCommitIds, ["c-orphan"]);
  assert.equal(useWindowManager.getState().windows.length, 0);
  assert.equal(useRecordPreviews.getState().previews.length, 0);
  assert.equal(useReviewCards.getState().order.length, 0);
});

test("ingestProposal opens a left-side memory cloud once per kind", () => {
  const event = {
    proposalId: "prop_1",
    toolCallId: "t1",
    messageId: "m1",
    kind: "note" as const,
    reason: "刚讲清了定义",
    titleHint: "渗透压",
  };
  useMemoryInbox.getState().ingestProposal(event);
  useMemoryInbox.getState().ingestProposal(event);
  useMemoryInbox.getState().ingestProposal({ ...event, proposalId: "prop_2", reason: "又来一次" });
  assert.deepEqual(useMemoryInbox.getState().order, ["prop_1"]);
  assert.equal(useMemoryInbox.getState().byId.prop_1?.status, "proposed");
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
});

test("confirm note 不走 sendToChat，旁路仍带上下文和 memoryCommit", async () => {
  let seen: RunNoteCommitInput | undefined;
  setNoteCommitRunnerForTests(async (input) => {
    seen = input;
    const assistant = noteCommitMessage(input.title || "课堂要点");
    input.onWrite(assistant);
    return assistant;
  });
  useMemoryInbox.getState().ingestProposal({
    proposalId: "prop_1",
    toolCallId: "t1",
    messageId: "m1",
    kind: "note",
    reason: "值得记住",
    titleHint: "渗透压",
  });
  useMemoryInbox.getState().confirm("prop_1");
  assert.equal(useStore.getState().outbound, null);
  await flushAsync();
  assert.ok(seen);
  assert.equal(seen?.title, "渗透压");
  assert.equal(seen?.historyMessages.length, 2);
  assert.equal(seen?.historyMessages[0]?.id, "u1");
  assert.equal(seen?.historyMessages[1]?.id, "m1");
  assert.equal(seen?.sessionId, "main");
  assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
});

test("confirm note 成功后关云并打开笔记窗，主 thread 仍干净", async () => {
  useMemoryInbox.getState().ingestProposal({
    proposalId: "prop_1",
    toolCallId: "t1",
    messageId: "m1",
    kind: "note",
    reason: "值得记住",
    titleHint: "渗透压",
  });
  useMemoryInbox.getState().confirm("prop_1");
  await flushAsync();
  assert.equal(useStore.getState().outbound, null);
  assert.equal(useMemoryInbox.getState().byId.prop_1?.status, "dismissed");
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "user-note-editor"));
  assert.ok(!useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
  assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
});

test("confirm note 失败时云内报错，主 thread 仍干净", async () => {
  setNoteCommitRunnerForTests(async () => {
    throw new Error("模型超时");
  });
  useMemoryInbox.getState().ingestProposal({
    proposalId: "prop_1",
    toolCallId: "t1",
    messageId: "m1",
    kind: "note",
    reason: "值得记住",
    titleHint: "渗透压",
  });
  useMemoryInbox.getState().confirm("prop_1");
  await flushAsync();
  assert.equal(useStore.getState().outbound, null);
  assert.equal(useMemoryInbox.getState().byId.prop_1?.status, "proposed");
  assert.match(useMemoryInbox.getState().byId.prop_1?.error ?? "", /模型超时/);
  assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
});

test("confirm flashcard 不走 sendToChat，旁路仍带历史和 memoryCommit=flashcards", async () => {
  let seen: RunMemoryCommitInput | undefined;
  setMemoryCommitRunnerForTests(async (input) => {
    seen = input;
    const assistant = flashcardCommitMessage(input.mode || "cloze");
    input.onWrite(assistant);
    return assistant;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  try {
    useMemoryInbox.getState().ingestProposal({
      proposalId: "prop_f",
      toolCallId: "t2",
      messageId: "m1",
      kind: "flashcard",
      reason: "值得测验",
      suggestedMode: "cloze",
    });
    useMemoryInbox.getState().confirm("prop_f");
    assert.equal(useStore.getState().outbound, null);
    await flushAsync();
    assert.ok(seen);
    assert.equal(seen?.memoryCommit, "flashcards");
    assert.equal(seen?.mode, "cloze");
    assert.equal(seen?.historyMessages.length, 2);
    assert.equal(seen?.historyMessages[0]?.id, "u1");
    assert.equal(seen?.historyMessages[1]?.id, "m1");
    assert.equal(seen?.sessionId, "main");
    assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirm flashcard 成功后关云并打开成卡预览，主 thread 仍干净", async () => {
  setMemoryCommitRunnerForTests(async (input) => {
    const assistant = flashcardCommitMessage(input.mode || "cloze");
    input.onWrite(assistant);
    return assistant;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  try {
    useMemoryInbox.getState().ingestProposal({
      proposalId: "prop_f",
      toolCallId: "t2",
      messageId: "m1",
      kind: "flashcard",
      reason: "值得测验",
      suggestedMode: "quiz",
    });
    useMemoryInbox.getState().confirm("prop_f");
    await flushAsync();
    assert.equal(useStore.getState().outbound, null);
    assert.equal(useMemoryInbox.getState().byId.prop_f?.status, "dismissed");
    assert.ok(useWindowManager.getState().windows.some((win) => win.type === "record-preview"));
    assert.ok(!useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
    assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
    assert.ok(useRecordPreviews.getState().previews.length >= 1);
    assert.ok(useReviewCards.getState().order.length >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirm flashcard 失败时云内报错，主 thread 仍干净", async () => {
  setMemoryCommitRunnerForTests(async () => {
    throw new Error("模型超时");
  });
  useMemoryInbox.getState().ingestProposal({
    proposalId: "prop_f",
    toolCallId: "t2",
    messageId: "m1",
    kind: "flashcard",
    reason: "值得测验",
    suggestedMode: "cloze",
  });
  useMemoryInbox.getState().confirm("prop_f");
  await flushAsync();
  assert.equal(useStore.getState().outbound, null);
  assert.equal(useMemoryInbox.getState().byId.prop_f?.status, "proposed");
  assert.match(useMemoryInbox.getState().byId.prop_f?.error ?? "", /模型超时/);
  assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "memory-proposal"));
  assert.ok(!useWindowManager.getState().windows.some((win) => win.type === "record-preview"));
});

test("confirm flashcard 没有工具输出时云内报错，主 thread 仍干净", async () => {
  setMemoryCommitRunnerForTests(async (input) => {
    const assistant = createAssistantPlaceholder("side-empty", {});
    input.onWrite(assistant);
    return assistant;
  });
  useMemoryInbox.getState().ingestProposal({
    proposalId: "prop_f",
    toolCallId: "t2",
    messageId: "m1",
    kind: "flashcard",
    reason: "值得测验",
    suggestedMode: "cloze",
  });
  useMemoryInbox.getState().confirm("prop_f");
  await flushAsync();
  assert.equal(useStore.getState().outbound, null);
  assert.equal(useMemoryInbox.getState().byId.prop_f?.status, "proposed");
  assert.match(useMemoryInbox.getState().byId.prop_f?.error ?? "", /没有写出闪卡/);
  assert.equal(useChatHistory.getState().messagesById.main?.length, 2);
});
