import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserNoteLayer from "./UserNoteLayer";
import UserNoteProposalRuntime from './UserNoteProposalRuntime';
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { useStore } from "@/lib/stores/ui";
import { useNoteChangeProposals } from "@/lib/stores/assets/noteChangeProposals";
import { createAndOpenClassroomNote, createAndOpenNote, openNoteLibrary } from "@/lib/notes/openUserNote";
import { BLANK_NOTE_MARKDOWN, EXAMPLE_USER_NOTE_ID } from "@/lib/notes/userNote";

vi.mock("@/components/chat/ChatThread", () => ({
  default: () => <div data-testid="note-agent-thread" />,
}));
vi.mock("@/components/chat/composer/ChatInput", () => ({
  default: () => <div data-testid="note-agent-input" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/components/notes/MilkdownNoteEditor", () => ({
  default: () => <div data-testid="crepe-stub">渲染编辑器</div>,
}));

describe("personal note windows", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    useUserNotes.setState({
      byId: {},
      order: [],
      libraryRevision: 0,
      openEditorIds: [],
      agentEditingNoteId: null,
      noteAgentOpenIds: [],
      noteAgentSessionById: {},
      libraryOpen: false,
      libraryIntent: "browse",
      librarySubjectId: null,
    });
    useChatUI.getState().clearQuotedText();
    useChatHistory.setState({
      messagesById: { main: [] },
      activeSessionId: "main",
      sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
      sessionLoadState: { main: "loaded" },
      loadedSessionIds: ["main"],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: true,
    });
    useStore.setState({ rightTab: "video", mobileTab: "detail" });
    useNoteChangeProposals.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates a blank note instead of cloning the case template", () => {
    const id = createAndOpenNote("probability");
    expect(useUserNotes.getState().byId[id]?.title).toBe("无标题笔记");
    expect(useUserNotes.getState().byId[id]?.markdown).toBe(BLANK_NOTE_MARKDOWN);
    expect(useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID]).toBeUndefined();
  });

  it("shows the seeded case note in the cite library without cloning it on create", () => {
    openNoteLibrary({ subjectId: null, intent: "cite" });
    render(<UserNoteLayer />);

    expect(screen.getByRole("button", { name: /案例笔记/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "案例笔记" })).toBeInTheDocument();
    expect(useUserNotes.getState().order).toEqual([EXAMPLE_USER_NOTE_ID]);

    fireEvent.click(screen.getByRole("button", { name: "新建笔记" }));
    const created = useUserNotes.getState().order.find((id) => id !== EXAMPLE_USER_NOTE_ID);
    expect(created).toBeTruthy();
    expect(useUserNotes.getState().byId[created!]?.markdown).toBe(BLANK_NOTE_MARKDOWN);
    expect(useUserNotes.getState().byId[EXAMPLE_USER_NOTE_ID]?.title).toBe("案例笔记");
    expect(useUserNotes.getState().order.filter((id) => id === EXAMPLE_USER_NOTE_ID)).toHaveLength(1);
  });

  it("edits markdown in split view and live-renders formulas", () => {
    const id = createAndOpenNote("probability");
    render(<UserNoteLayer />);

    fireEvent.click(screen.getByRole("button", { name: "分栏" }));
    const editor = screen.getByLabelText("笔记正文（Markdown）");
    fireEvent.change(editor, {
      target: { value: "# 期望\n\n行内 $E(X)=\\lambda$\n\n$$\\int_0^1 x\\,dx$$" },
    });

    expect(useUserNotes.getState().byId[id]?.title).toBe("期望");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("期望");
    expect(screen.getByText("期望", { selector: "h1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "引用到右侧对话" }));
    expect(useChatUI.getState().quotedText).toMatch(/【笔记】期望/);
    expect(useUserNotes.getState().agentEditingNoteId).toBe(id);
    expect(useStore.getState().rightTab).toBe("ai");
  });

  it("places the AI conversation icon between the title and subject", () => {
    createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "# 被覆上皮" });
    render(<UserNoteLayer />);

    const title = screen.getByLabelText("笔记标题");
    const ai = screen.getByRole("button", { name: "笔记对话" });
    const subject = screen.getByTestId("subject-picker");
    expect(subject).toHaveTextContent("系统解剖学");
    expect(title.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ai.compareDocumentPosition(subject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ai.querySelector("svg")).toBeTruthy();
    expect(ai.innerHTML).toMatch(/lucide-message-square|message-square/i);
  });

  it("changes the note subject from the title chip and persists it", () => {
    const id = createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "# 被覆上皮" });
    render(<UserNoteLayer />);

    fireEvent.click(screen.getByTestId("subject-picker"));
    fireEvent.click(screen.getByTestId("subject-picker-option-physics"));

    expect(useUserNotes.getState().byId[id]?.subjectId).toBe("physics");
    expect(screen.getByTestId("subject-picker")).toHaveTextContent("大学物理");
  });

  it("keeps a home-shelf note unfiled until the subject menu files it", () => {
    const id = createAndOpenNote(null);
    render(<UserNoteLayer />);

    expect(useUserNotes.getState().byId[id]?.subjectId).toBeNull();
    expect(screen.getByTestId("subject-picker")).toHaveTextContent("未归档");

    fireEvent.click(screen.getByTestId("subject-picker"));
    expect(screen.getByTestId("subject-picker-option-unfiled")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("subject-picker-option-probability"));

    expect(useUserNotes.getState().byId[id]?.subjectId).toBe("probability");
    expect(screen.getByTestId("subject-picker")).toHaveTextContent("概率论");
  });

  it("does not write a note from an agent tool result without the user approving it", () => {
    const id = createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "旧稿" });
    const sessionId = useUserNotes.getState().ensureNoteAgentSession(id);
    expect(sessionId).toBeTruthy();
    render(<><UserNoteProposalRuntime/><UserNoteLayer /></>);

    act(() => {
      useChatHistory.setState({
        activeSessionId: "main",
        messagesById: {
          main: [],
          [sessionId!]: [
            {
              id: "a-consent",
              role: "assistant",
              timestamp: 1,
              parts: [
                {
                  type: "tool-updateUserNote",
                  toolCallId: "u-consent",
                  state: "output-available",
                  input: { markdown: "# 被覆上皮\n\n1. 单层扁平" },
                  output: {
                    text: "已生成候选稿，等学生在前端点「同意修改」。",
                    proposalId: "u-consent",
                    ok: true,
                    noteId: id,
                    markdown: "# 被覆上皮\n\n1. 单层扁平",
                    action: "update",
                    sourceComplete: true,
                    baseDigest: "",
                    summary: "修改笔记「被覆上皮」",
                  },
                },
              ],
            },
          ],
        },
      });
    });

    // 未点同意：正文、标题、更新时间都不许动。
    expect(useUserNotes.getState().byId[id]?.markdown).toBe("旧稿");
    expect(useUserNotes.getState().byId[id]?.title).toBe("被覆上皮");

    // 点同意后才落地。
    act(() => {
      const result = useNoteChangeProposals.getState().approve("u-consent");
      expect(result.ok).toBe(true);
    });
    expect(useUserNotes.getState().byId[id]?.markdown).toBe("# 被覆上皮\n\n1. 单层扁平");
  });

  it("opens an in-window note agent without touching the main thread", () => {
    const id = createAndOpenNote("anatomy", { title: "被覆上皮", markdown: "旧稿" });
    const mainMessages = [
      { id: "m1", role: "user" as const, timestamp: 1, parts: [{ type: "text" as const, text: "主对话还在" }] },
    ];
    useChatHistory.setState({
      activeSessionId: "main",
      messagesById: { main: mainMessages },
      sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 1, artifactIds: [] }],
    });
    useStore.setState({ rightTab: "video", mobileTab: "detail" });
    render(<UserNoteLayer />);

    fireEvent.click(screen.getByRole("button", { name: "笔记对话" }));
    const sessionId = useUserNotes.getState().noteAgentSessionById[id];
    expect(useUserNotes.getState().noteAgentOpenIds).toContain(id);
    expect(sessionId).toBeTruthy();
    expect(useUserNotes.getState().agentEditingNoteId).toBeNull();
    expect(useChatUI.getState().quotedText).toBeNull();
    expect(useStore.getState().rightTab).toBe("video");
    expect(useChatHistory.getState().messagesById.main).toEqual(mainMessages);
    expect(screen.getByRole("region", { name: "笔记对话" })).toBeTruthy();
    expect(screen.getByTestId("note-agent-thread")).toBeTruthy();
    expect(screen.getByTestId("note-agent-input")).toBeTruthy();

    act(() => {
      useChatHistory.setState({
        messagesById: {
          main: mainMessages,
          [sessionId!]: [
            {
              id: "a1",
              role: "assistant",
              timestamp: 1,
              parts: [
                {
                  type: "tool-updateUserNote",
                  toolCallId: "u-layer",
                  state: "output-available",
                  input: { markdown: "# 被覆上皮\n\n1. 单层扁平" },
                  output: {
                    text: "已生成候选稿，等学生在前端点「同意修改」。",
                    proposalId: "u-layer",
                    ok: true,
                    noteId: id,
                    markdown: "# 被覆上皮\n\n1. 单层扁平",
                    action: "update",
                    sourceComplete: true,
                    baseDigest: "",
                    summary: "修改笔记「被覆上皮」",
                  },
                },
              ],
            },
          ],
        },
      });
    });

    // 工具结果只是候选稿：没点同意，正文与标题都不动。
    expect(useUserNotes.getState().byId[id]?.markdown).toBe("旧稿");
    expect(useNoteChangeProposals.getState().statusOf("u-layer")).toBe("pending");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("被覆上皮");
    expect(useChatHistory.getState().messagesById.main).toEqual(mainMessages);
    expect(screen.getByRole("navigation", { name: "笔记目录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "刷新渲染" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "隐藏目录" }));
    expect(screen.queryByRole("navigation", { name: "笔记目录" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示目录" }));
    expect(screen.getByRole("navigation", { name: "笔记目录" })).toBeTruthy();
  });

  it("filters the library from the folder tree and hides the all-subjects chip", () => {
    const probabilityId = useUserNotes.getState().createNote("probability");
    useUserNotes.getState().updateNote(probabilityId, { title: "泊松笔记", markdown: "泊松" });
    const physicsId = useUserNotes.getState().createNote("physics");
    useUserNotes.getState().updateNote(physicsId, { title: "牛顿笔记", markdown: "牛顿" });
    openNoteLibrary({ subjectId: "probability", intent: "cite" });
    render(<UserNoteLayer />);

    expect(screen.getByRole("navigation", { name: "文件夹" })).toBeInTheDocument();
    expect(screen.getByTestId("folder-tree-resize-handle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "大一下学期" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部科目" })).not.toBeInTheDocument();
    const search = screen.getByLabelText("按标题搜索笔记");
    expect(search).toBeInTheDocument();
    expect(search).toHaveClass("is-offset");

    expect(screen.getByRole("button", { name: /泊松笔记/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /牛顿笔记/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "大学物理" }));
    expect(screen.queryByRole("button", { name: /泊松笔记/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /牛顿笔记/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByRole("button", { name: /泊松笔记/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /牛顿笔记/ })).toBeInTheDocument();
  });

  it("lists classroom notes in the cite library and opens the sticky editor", () => {
    createAndOpenClassroomNote({
      quote: "泊松分布的均值等于方差",
      sourceKind: "agent",
      subjectId: "probability",
    });
    openNoteLibrary({ subjectId: "probability", intent: "cite" });
    render(<UserNoteLayer />);

    fireEvent.click(screen.getByRole("button", { name: "课堂笔记" }));
    expect(screen.getByRole("button", { name: /泊松分布的均值等于方差/ })).toBeInTheDocument();
    expect(screen.getByText("原文引用")).toBeInTheDocument();
    expect(screen.getByText("整理信息")).toBeInTheDocument();
    expect(screen.getByText(/出处/)).toBeInTheDocument();
    expect(screen.getByLabelText("课堂笔记标题")).toBeInTheDocument();
    expect(screen.getByText("原文")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "引用到对话" }));
    expect(useChatUI.getState().quotedText).toMatch(/【课堂笔记/);
    expect(useChatUI.getState().quotedText).toMatch(/泊松分布的均值等于方差/);
  });

  it("opens Review-origin selection notes in the shared tree, editor and outline workspace", () => {
    const id = createAndOpenClassroomNote({
      quote: "公开合成 Review 选区",
      sourceKind: "review",
      subjectId: "anatomy",
    });
    expect(id).toBeTruthy();
    render(<UserNoteLayer />);

    expect(screen.getByTestId("review-note-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("year-subject-folder-tree")).toBeInTheDocument();
    expect(screen.getByTestId("review-note-toc")).toBeInTheDocument();
    expect(screen.getAllByText("公开合成 Review 选区").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps Class classroom notes in the compact sticky surface", () => {
    createAndOpenClassroomNote({
      quote: "公开合成 Class 课堂摘录",
      sourceKind: "class",
      subjectId: "anatomy",
    });
    render(<UserNoteLayer />);

    expect(screen.getAllByText("公开合成 Class 课堂摘录").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".classroom-note")).toBeInTheDocument();
    expect(screen.queryByTestId("review-note-workspace")).toBeNull();
  });

  it("cites a user note into the chat quote tray from the library", () => {
    const id = useUserNotes.getState().createNote("probability");
    useUserNotes.getState().updateNote(id, { title: "课堂备忘", markdown: "记住 $P(A \\cup B)$。" });
    openNoteLibrary({ subjectId: "probability", intent: "cite" });
    render(<UserNoteLayer />);

    fireEvent.click(screen.getByRole("button", { name: "引用到对话" }));
    expect(useChatUI.getState().quotedText).toMatch(/【笔记】课堂备忘/);
    expect(useChatUI.getState().quotedText).toMatch(/P\(A \\cup B\)/);
  });
});
