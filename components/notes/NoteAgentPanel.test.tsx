import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import NoteAgentPanel from "./NoteAgentPanel";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useSettings } from "@/lib/stores/settings";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useStore } from "@/lib/stores/ui";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { getMessageText } from "@/lib/chat/messageParts";

vi.mock("@/lib/storage/idbStorage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/storage/idbStorage")>(),
  idbStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(),
    setItemLazy: vi.fn(),
    removeItem: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/stores/chat/chatHistory", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/stores/chat/chatHistory")>(),
  ensureChatHistoryBootstrap: vi.fn(async () => {}),
}));
vi.mock("@/components/chat/ChatThread", () => ({
  default: ({ emptyState }: { emptyState: ReactNode }) => (
    <div data-testid="note-agent-thread">{emptyState}</div>
  ),
}));
vi.mock("@/components/chat/composer/ChatInput", () => ({
  default: ({ onSend, disableQuote, quoteText, onClearQuote }: {
    onSend: (text: string) => void;
    disableQuote?: boolean;
    quoteText?: string | null;
    onClearQuote?: () => void;
  }) => (
    <div>
      <span data-testid="note-agent-quote">{String(disableQuote)}</span>
      <span data-testid="note-agent-quotetext">{quoteText ?? ""}</span>
      <button type="button" onClick={() => onClearQuote?.()}>清除引用</button>
      <button type="button" onClick={() => onSend("把分类补全")}>发送笔记对话</button>
    </div>
  ),
}));

const initialSettings = useSettings.getState();
let requests: Array<Record<string, unknown>>;

function encode(chunk: UIMessageChunk) {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function completedResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const chunk of [
        { type: "start", messageId: "remote-id" },
        { type: "start-step" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "已改稿" },
        { type: "text-end", id: "t" },
        { type: "finish" },
      ] as UIMessageChunk[]) {
        controller.enqueue(encode(chunk));
      }
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
  });
  return response;
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe("NoteAgentPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
      if (url === "/api/chat-title") return Response.json({ title: "笔记对话标题" });
      requests.push(JSON.parse(String(init?.body)));
      return completedResponse();
    }));
    useSettings.setState({ ...initialSettings, selectedModelId: "mimo-v2.5", customApiGroups: [] });
    useStore.setState({
      activeSubjectId: "anatomy",
      activeCategoryId: "textbook",
      activeItemId: "ch01",
    });
    useUserNotes.setState({
      byId: {},
      order: [],
      openEditorIds: [],
      agentEditingNoteId: null,
      noteAgentOpenIds: [],
      noteAgentSessionById: {},
    });
    useChatUI.setState({ quotedText: null, noteQuotes: {} });
    const noteId = useUserNotes.getState().createNote("anatomy", {
      title: "被覆上皮",
      markdown: "# 被覆上皮\n\n旧稿",
    });
    useUserNotes.getState().openEditor(noteId);
    useUserNotes.setState({
      noteAgentOpenIds: [noteId],
      noteAgentSessionById: { [noteId]: "note-s" },
    });
    useChatHistory.setState({
      activeSessionId: "main",
      _hasHydrated: true,
      _activeMessagesReady: true,
      messagesById: {
        main: [{ id: "keep", role: "user", timestamp: 1, parts: [{ type: "text", text: "主对话还在" }] }],
        "note-s": [],
      },
      sessionsMeta: [
        { id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 1, artifactIds: [] },
        { id: "note-s", title: "被覆上皮", createdAt: 1, updatedAt: 1, kind: "note", messageCount: 0, artifactIds: [] },
      ],
      sessionLoadState: { main: "loaded", "note-s": "loaded" },
      loadedSessionIds: ["main", "note-s"],
      pinnedSessionIds: [],
    });
  });

  afterEach(async () => {
    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends against the note session with this note as editing context", async () => {
    const noteId = useUserNotes.getState().order[0];
    render(<NoteAgentPanel noteId={noteId} sessionId="note-s" />);
    expect(screen.getByRole("region", { name: "笔记对话" })).toBeTruthy();
    expect(screen.getByTestId("note-agent-quote")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("button", { name: "发送笔记对话" }));
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: "note-s",
      editingUserNote: { id: noteId, title: "被覆上皮", markdown: "# 被覆上皮\n\n旧稿" },
      noteWindowAgent: true,
    });
    expect(getMessageText(useChatHistory.getState().messagesById["note-s"][0])).toBe("把分类补全");
    expect(getMessageText(useChatHistory.getState().messagesById.main[0])).toBe("主对话还在");
  });

  it("把按笔记写入的引用槽传给输入框，且清除只清这篇笔记", () => {
    const noteId = useUserNotes.getState().order[0];
    useChatUI.getState().setNoteQuote(noteId, "上皮组织覆盖体表");
    useChatUI.getState().setQuotedText("主对话引用不应串入");
    render(<NoteAgentPanel noteId={noteId} sessionId="note-s" />);
    expect(screen.getByTestId("note-agent-quotetext")).toHaveTextContent("上皮组织覆盖体表");
    fireEvent.click(screen.getByRole("button", { name: "清除引用" }));
    expect(useChatUI.getState().noteQuotes[noteId]).toBeUndefined();
    // 全局引用槽不受笔记面板影响
    expect(useChatUI.getState().quotedText).toBe("主对话引用不应串入");
  });
});
