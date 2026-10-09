import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentConversationSidebar from "./AgentConversationSidebar";
import { useSessionRuns } from "@/lib/stores/sessionRuns";

type TestSession = {
  id: string;
  title: string;
  kind: string;
  updatedAt: number;
  messageCount: number;
  preview?: string;
  archived?: boolean;
  folderId?: string | null;
};

const push = vi.fn();
/** 当前路由可切换：验证「在资产页点会话/新对话要跳回对话页」。 */
const routeRef = { pathname: "/agent" };

const historyState = {
  sessionsMeta: [] as TestSession[],
  activeSessionId: null as string | null,
  activeProjectId: null as string | null,
  folders: [
    { id: "project-note", name: "笔记记录", createdAt: 0, system: "note" as const },
    { id: "project-floating", name: "划词摘录", createdAt: 0, system: "floating" as const },
    { id: "folder-a", name: "组胚", createdAt: 5, updatedAt: 5 },
  ],
  startNewChat: vi.fn(() => "session-1"),
  deleteSession: vi.fn(),
  switchSession: vi.fn(),
  archiveSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  createFolder: vi.fn(() => "folder-new"),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(() => true),
  moveSessionToFolder: vi.fn(),
  setActiveProject: vi.fn(),
};

const restoreWindow = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => routeRef.pathname,
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/hooks/useChatHistory", () => ({
  useChatHistory: Object.assign(
    (selector: (state: typeof historyState) => unknown) => selector(historyState),
    { getState: () => historyState },
  ),
  ensureChatHistoryBootstrap: () => Promise.resolve(),
}));
vi.mock("@/lib/hooks/useFloatingChats", () => ({
  useFloatingChats: { getState: () => ({ windows: [], closeWindow: vi.fn(), restoreWindow }) },
}));
vi.mock("@/lib/hooks/useTokenTracker", () => ({
  useTokenTracker: { getState: () => ({ resetSession: vi.fn() }) },
}));
vi.mock("./LeftDock", () => ({
  default: () => (
    <button type="button" data-testid="left-dock">
      <span data-testid="user-avatar" />
    </button>
  ),
}));
vi.mock("./GlobalSettings", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  historyState.sessionsMeta = [];
  historyState.activeSessionId = null;
  historyState.activeProjectId = null;
  routeRef.pathname = "/agent";
  useSessionRuns.setState({ byId: {} });
});

const ctx = {
  subjectId: "anatomy" as const,
  categoryId: "detail",
  itemId: "1.1",
  currentTopic: "anatomy detail 1.1",
};

function seedSessions() {
  historyState.sessionsMeta = [
    { id: "main-1", title: "细胞生物学复习", kind: "main", updatedAt: 1_700_000_000_000, messageCount: 8, preview: "线粒体" },
    { id: "float-1", title: "解释线粒体", kind: "floating", updatedAt: 1_700_000_100_000, messageCount: 3 },
    { id: "note-1", title: "被覆上皮", kind: "note", updatedAt: 1_700_000_200_000, messageCount: 2 },
    { id: "proj-1", title: "组胚复习", kind: "main", updatedAt: 1_700_000_300_000, messageCount: 5, folderId: "folder-a" },
  ] as TestSession[];
}

describe("AgentConversationSidebar（项目 + 最近）", () => {
  it("非对话页点新对话 / 点会话：都要跳回 /agent", () => {
    seedSessions();
    routeRef.pathname = "/agent/assets";
    render(<AgentConversationSidebar chatContext={ctx} />);

    fireEvent.click(screen.getByTestId("agent-nav-new-chat"));
    expect(push).toHaveBeenCalledWith("/agent");
    expect(historyState.startNewChat).toHaveBeenCalled();

    push.mockClear();
    fireEvent.click(screen.getByLabelText("细胞生物学复习"));
    expect(push).toHaveBeenCalledWith("/agent");
    expect(historyState.switchSession).toHaveBeenCalledWith("main-1");
  });

  it("四行导航固定在最上；系统项目与用户项目各归各的会话", () => {
    seedSessions();
    render(<AgentConversationSidebar chatContext={ctx} />);
    expect(screen.getByTestId("agent-nav")).toBeInTheDocument();
    expect(screen.getByTestId("agent-nav-new-chat")).toHaveTextContent("新对话");
    expect(screen.getByTestId("agent-nav-assets")).toHaveTextContent("我的资产");
    expect(screen.getByTestId("agent-nav-scheduled")).toHaveTextContent("定时任务");
    expect(screen.getByTestId("agent-nav-plugins")).toHaveTextContent("插件市场");
    expect(screen.getByTestId("agent-projects")).toBeInTheDocument();
    expect(screen.getByTestId("agent-recents")).toBeInTheDocument();
    // 系统项目：笔记记录 / 划词摘录
    expect(screen.getByLabelText("笔记记录")).toBeInTheDocument();
    expect(screen.getByLabelText("划词摘录")).toBeInTheDocument();
    expect(screen.queryByTestId("session-run-running")).not.toBeInTheDocument();
    expect(screen.queryByTestId("session-run-done")).not.toBeInTheDocument();
    expect(screen.getByText("被覆上皮")).toBeInTheDocument();
    expect(screen.getByText("解释线粒体")).toBeInTheDocument();
    expect(screen.getByLabelText("细胞生物学复习").querySelector(".agent-session-title-fade")).toBeInTheDocument();
    // 用户项目里的会话与 Recents 里的会话
    expect(screen.getByText("组胚复习")).toBeInTheDocument();
    expect(screen.getByText("细胞生物学复习")).toBeInTheDocument();
    expect(screen.getByTestId("left-dock")).toBeInTheDocument();
  });

  it("Projects 折叠标题右侧的新建项目入口始终可见，焦点和悬停时增强", () => {
    render(<AgentConversationSidebar chatContext={ctx} />);
    const addProject = screen.getByTestId("agent-project-add");
    expect(addProject).toBeVisible();
    const action = addProject.parentElement;
    expect(addProject).toHaveClass("h-7", "w-7");
    expect(action?.className).toContain("opacity-60");
    expect(action?.className).toContain("group-hover/section:opacity-100");
    expect(action?.className).toContain("focus-within:opacity-100");
    fireEvent.click(screen.getByLabelText("项目"));
    expect(screen.getByLabelText("项目")).toHaveAttribute("aria-expanded", "false");
    expect(addProject).toBeVisible();
  });

  it("我的资产走路由跳转（不再是弹窗）", () => {
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.click(screen.getByTestId("agent-nav-assets"));
    expect(push).toHaveBeenCalledWith("/agent/assets");
    fireEvent.click(screen.getByTestId("agent-nav-scheduled"));
    expect(push).toHaveBeenCalledWith("/agent/scheduled");
    fireEvent.click(screen.getByTestId("agent-nav-plugins"));
    expect(push).toHaveBeenCalledWith("/agent/plugins");
  });

  it("新对话把当前项目作为落点；点会话会同步项目落点", () => {
    seedSessions();
    historyState.activeProjectId = "folder-a";
    historyState.activeSessionId = "main-1";
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.click(screen.getByTestId("agent-nav-new-chat"));
    expect(historyState.startNewChat).toHaveBeenCalledWith(ctx, "folder-a");

    fireEvent.click(screen.getByLabelText("细胞生物学复习"));
    expect(historyState.switchSession).toHaveBeenCalledWith("main-1");
    expect(historyState.setActiveProject).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByLabelText("划词摘录"));
    historyState.switchSession.mockClear();
  });

  it("划词会话点开是还原浮窗，不是切主对话", () => {
    seedSessions();
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.click(screen.getByLabelText("解释线粒体"));
    expect(restoreWindow).toHaveBeenCalledWith("float-1");
    expect(historyState.switchSession).not.toHaveBeenCalled();
  });

  it("会话标题旁按真实run显示状态，已读终态保留淡指示", () => {
    seedSessions();
    useSessionRuns.setState({
      byId: {
        "main-1": { phase: "running", unseen: false, startedAt: 1, updatedAt: 1 },
        "float-1": { phase: "done", unseen: true, startedAt: 1, updatedAt: 2 },
        "note-1": { phase: "error", unseen: true, error: "上游返回错误", startedAt: 1, updatedAt: 3 },
        "proj-1": { phase: "done", unseen: false, startedAt: 1, updatedAt: 4 },
      },
    });
    render(<AgentConversationSidebar chatContext={ctx} />);
    const running = screen.getByTestId("session-run-running");
    const doneBadges = screen.getAllByTestId("session-run-done");
    expect(running).toBeInTheDocument();
    expect(doneBadges).toHaveLength(1);
    expect(screen.getAllByTestId("session-run-error")).toHaveLength(1);
    expect(running.closest("button")).toHaveAttribute("aria-describedby", running.id);
    expect(doneBadges[0]).toHaveAttribute("data-run-unseen", "true");
    expect(doneBadges[0].querySelector(".agent-session-run-label")).toHaveTextContent("已完成");
    expect(doneBadges[0]).toHaveAttribute("aria-label", "已完成（未读）");
    // 已读的「已完成」直接消失，不留淡色版本。
    expect(doneBadges.some((element) => element.getAttribute("data-run-unseen") === "false")).toBe(false);
  });

  it("项目折叠时把成员会话运行态聚成一颗徽标", () => {
    seedSessions();
    useSessionRuns.setState({
      byId: { "proj-1": { phase: "running", unseen: false, startedAt: 1, updatedAt: 1 } },
    });
    render(<AgentConversationSidebar chatContext={ctx} />);
    // 折叠项目行后，成员会话的运行态聚到项目行上（AnimatedCollapse 隐藏但保留子行 DOM）。
    fireEvent.click(screen.getByLabelText("组胚"));
    const projectRow = screen.getByLabelText("组胚").closest("div")!.parentElement!;
    expect(within(projectRow).getByTestId("session-run-running")).toBeInTheDocument();
  });

  it("项目折叠后，已读的完成态不再显示任何提示", () => {
    seedSessions();
    useSessionRuns.setState({
      byId: { "proj-1": { phase: "done", unseen: false, startedAt: 10, updatedAt: 20 } },
    });
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.click(screen.getByLabelText("组胚"));
    const projectRow = screen.getByLabelText("组胚").closest("div")!.parentElement!;
    expect(within(projectRow).queryByTestId("session-run-done")).toBeNull();
  });

  it("搜索按钮可点：展开输入框，按标题过滤（转义、不区分大小写），Esc 关闭", () => {
    historyState.sessionsMeta = [
      { id: "s-a", title: "Alpha (draft)", kind: "main", updatedAt: 3, messageCount: 1 },
      { id: "s-b", title: "beta", kind: "main", updatedAt: 2, messageCount: 1 },
    ] as TestSession[];
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.click(screen.getByTestId("agent-sidebar-search-toggle"));
    const input = screen.getByTestId("agent-sidebar-search-input");
    fireEvent.change(input, { target: { value: "ALPHA (" } });
    expect(screen.getByText("Alpha (draft)")).toBeInTheDocument();
    expect(screen.queryByText("beta")).toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("agent-sidebar-search-input")).toBeNull();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("默认一次 10 条，续载后放出其余", () => {
    historyState.sessionsMeta = Array.from({ length: 13 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `批量对话 ${i}`,
      kind: "main",
      updatedAt: 1_700_000_000_000 - i,
      messageCount: 1,
    })) as TestSession[];
    render(<AgentConversationSidebar chatContext={ctx} />);
    expect(screen.getByText("批量对话 9")).toBeInTheDocument();
    expect(screen.queryByText("批量对话 10")).toBeNull();
    fireEvent.click(screen.getByText("还有 3 个"));
    expect(screen.getByText("批量对话 12")).toBeInTheDocument();
  });

  it("会话右键：重命名 / 移动到项目 / 归档，删除要二次确认", () => {
    seedSessions();
    render(<AgentConversationSidebar chatContext={ctx} />);

    fireEvent.contextMenu(screen.getByLabelText("细胞生物学复习"));
    expect(screen.getByTestId("agent-panel-menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    const renameInput = screen.getByTestId("session-rename-input");
    fireEvent.change(renameInput, { target: { value: "细胞生物学复习（改）" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    expect(historyState.updateSessionTitle).toHaveBeenCalledWith("main-1", "细胞生物学复习（改）");

    fireEvent.contextMenu(screen.getByLabelText("细胞生物学复习"));
    fireEvent.click(screen.getByRole("menuitem", { name: "组胚" }));
    expect(historyState.moveSessionToFolder).toHaveBeenCalledWith("main-1", "folder-a");

    fireEvent.contextMenu(screen.getByLabelText("细胞生物学复习"));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除对话" }));
    expect(historyState.deleteSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("session-delete-confirm").querySelectorAll("button")[1]);
    expect(historyState.deleteSession).toHaveBeenCalledWith("main-1");
  });

  it("系统项目的会话不给「移动到项目」，也不给删项目入口", () => {
    seedSessions();
    render(<AgentConversationSidebar chatContext={ctx} />);
    fireEvent.contextMenu(screen.getByLabelText("被覆上皮"));
    expect(screen.queryByText("移动到项目")).toBeNull();
    fireEvent.contextMenu(screen.getByLabelText("笔记记录"));
    expect(screen.queryByRole("menuitem", { name: "删除项目" })).toBeNull();
    // 删项目也要二次确认：第一次点只是换成确认块，确认后才落库。
    fireEvent.contextMenu(screen.getByLabelText("组胚"));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));
    expect(historyState.deleteFolder).not.toHaveBeenCalled();
    const confirm = screen.getByTestId("project-delete-confirm");
    expect(confirm).toHaveTextContent("退回 Recents");
    fireEvent.click(confirm.querySelectorAll("button")[1]);
    expect(historyState.deleteFolder).toHaveBeenCalledWith("folder-a");
  });

  it("面板右键新建项目，并且归档视图仍能切换", () => {
    historyState.sessionsMeta = [
      { id: "main-1", title: "细胞生物学复习", kind: "main", updatedAt: 1, messageCount: 8 },
      { id: "arch-1", title: "归档过的对话", kind: "main", updatedAt: 2, messageCount: 3, archived: true },
    ] as TestSession[];
    render(<AgentConversationSidebar chatContext={ctx} />);
    expect(screen.queryByText("归档过的对话")).toBeNull();

    fireEvent.contextMenu(screen.getByTestId("agent-conversation-sidebar"));
    fireEvent.click(screen.getByRole("menuitem", { name: "新建项目" }));
    expect(historyState.createFolder).toHaveBeenCalled();
    // 菜单点完就关（真实运行时新项目由 store 回填，这里只断言动作与关闭）
    expect(screen.queryByTestId("agent-panel-menu")).toBeNull();

    // 项目重命名：右键项目 → 重命名项目 → 就地输入 → Enter
    fireEvent.contextMenu(screen.getByLabelText("组胚"));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名项目" }));
    const projectInput = screen.getByTestId("project-rename-input");
    fireEvent.change(projectInput, { target: { value: "组织胚胎学" } });
    fireEvent.keyDown(projectInput, { key: "Enter" });
    expect(historyState.renameFolder).toHaveBeenCalledWith("folder-a", "组织胚胎学");

    fireEvent.click(screen.getByTestId("archived-toggle"));
    expect(screen.getByText("归档过的对话")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-projects")).toBeNull();
  });
});
