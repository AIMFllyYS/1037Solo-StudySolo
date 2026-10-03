"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Archive, Folder, FolderOpen, MessagesSquare, PanelLeftClose, Plus, Search } from "lucide-react";
import FolderTreeRow from "./FolderTreeRow";
import GlobalSettings from "./GlobalSettings";
import LeftDock from "./LeftDock";
import AgentNavRows from "@/components/agent/AgentNavRows";
import AgentSectionHeader from "@/components/agent/AgentSectionHeader";
import AgentSessionList from "@/components/agent/AgentSessionList";
import { SessionRunBadge } from "@/components/agent/AgentSessionRow";
import AgentPanelMenu, { type AgentMenuTarget } from "@/components/agent/AgentPanelMenu";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { useT } from "@/lib/i18n";
import { ensureChatHistoryBootstrap, useChatHistory } from "@/lib/hooks/useChatHistory";
import { useFloatingChats } from "@/lib/hooks/useFloatingChats";
import { useGlobalSearch } from "@/lib/keyboard/useGlobalSearch";
import { useStore } from "@/lib/stores/ui";
import { useSessionRuns, type SessionRunRecord } from "@/lib/stores/sessionRuns";
import { useTokenTracker } from "@/lib/hooks/useTokenTracker";
import { buildProjectViews, selectArchivedSessions, selectRecentSessions } from "@/lib/agent/projectViews";
import type { ChatContext } from "@/lib/types/chat";
import type { SessionMeta } from "@/lib/storage/chatStorage";

interface PanelMenuState {
  x: number;
  y: number;
  target: AgentMenuTarget;
  returnFocusElement: HTMLElement;
}

/**
 * 项目折叠时把成员会话的真实运行态聚成一条徽标。
 * 优先级为 running > 未读错误 > 未读完成；没有未读结果时保留最新终态的淡提示。
 */
function aggregateProjectRun(
  sessions: SessionMeta[],
  byId: Record<string, SessionRunRecord>,
): SessionRunRecord | undefined {
  const runs = sessions.map((s) => byId[s.id]).filter(Boolean) as SessionRunRecord[];
  const latest = (candidates: SessionRunRecord[]) =>
    candidates.reduce<SessionRunRecord | undefined>(
      (current, run) => !current || run.startedAt > current.startedAt ? run : current,
      undefined,
    );
  return latest(runs.filter((run) => run.phase === "running"))
    ?? latest(runs.filter((run) => run.unseen && (run.phase === "error" || run.phase === "interrupted")))
    ?? latest(runs.filter((run) => run.unseen && run.phase === "done"))
    // When the group is collapsed, retain the newest real terminal state in a faint tone too.
    ?? latest(runs.filter((run) => run.phase !== "running"));
}

/**
 * Agent 左栏。结构（用户口径）：
 * 固定头（标题 + 全局搜索 + 折叠）→ 固定四行导航（新对话 / 我的资产 / 定时任务 / 插件市场）
 * → **一起滚动**的 Projects 与 Recents → 固定底（头像/设置 + 归档开关）。
 *
 * 项目就是会话分组（folders）：两个系统项目由 kind 决定成员（笔记记录 / 划词摘录），
 * 用户项目按 meta.folderId 归拢；Recents 是「不属于任何项目的普通对话」。
 */
export default function AgentConversationSidebar({ chatContext }: { chatContext: ChatContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  /** 只有在对话页（/agent）才谈得上「切换会话」；在资产页等子页面点会话要先把人送回来。 */
  const onChatRoute = pathname === "/agent";
  /** 当前是不是「某条对话的深链」（/c/<对话ID>）。 */
  const deepLinked = pathname.startsWith("/c/");
  /**
   * 回到对话页。传了 sessionId 且人正在深链上时，换成那条对话的深链——
   * 否则地址栏会继续指着上一条对话，刷新后跳回去，深链就名存实亡了。
   */
  const goToChat = useCallback((sessionId?: string) => {
    if (sessionId && deepLinked) {
      router.push(`/c/${sessionId}`);
      return;
    }
    if (!onChatRoute) router.push("/agent");
  }, [deepLinked, onChatRoute, router]);
  const sessionsMeta = useChatHistory((s) => s.sessionsMeta);
  const folders = useChatHistory((s) => s.folders);
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const activeProjectId = useChatHistory((s) => s.activeProjectId);
  const startNewChat = useChatHistory((s) => s.startNewChat);
  const deleteSession = useChatHistory((s) => s.deleteSession);
  const switchSession = useChatHistory((s) => s.switchSession);
  const archiveSession = useChatHistory((s) => s.archiveSession);
  const updateSessionTitle = useChatHistory((s) => s.updateSessionTitle);
  const createFolder = useChatHistory((s) => s.createFolder);
  const renameFolder = useChatHistory((s) => s.renameFolder);
  const deleteFolder = useChatHistory((s) => s.deleteFolder);
  const moveSessionToFolder = useChatHistory((s) => s.moveSessionToFolder);
  const setActiveProject = useChatHistory((s) => s.setActiveProject);
  const runsById = useSessionRuns((s) => s.byId);
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<PanelMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  /** 待确认删除的项目 id（项目删除也要二次确认）。 */
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [recentsExpanded, setRecentsExpanded] = useState(true);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const menuReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void ensureChatHistoryBootstrap();
  }, []);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenu(null);
    setPendingDeleteId(null);
    setPendingDeleteProjectId(null);
    const target = menuReturnFocusRef.current;
    if (restoreFocus && target?.isConnected) {
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  }, []);

  const projects = useMemo(() => buildProjectViews(folders, sessionsMeta), [folders, sessionsMeta]);
  const userProjects = useMemo(() => projects.filter((project) => !project.system).map((project) => ({ id: project.id, name: project.name, createdAt: project.updatedAt })), [projects]);
  const recentSessions = useMemo(() => selectRecentSessions(sessionsMeta), [sessionsMeta]);
  const archivedSessions = useMemo(() => selectArchivedSessions(sessionsMeta), [sessionsMeta]);
  const activeMeta = sessionsMeta.find((session) => session.id === activeSessionId) ?? null;
  const onBlankChat = pathname === "/agent" && (activeMeta?.messageCount ?? 0) === 0;

  const handleNewChat = useCallback(
    (projectId?: string | null) => {
      // 先回对话页：在「我的资产 / 定时任务 / 插件市场」里点新对话，
      // 以前只改 store 不导航，用户看到的是「点了没反应」。
      goToChat();
      startNewChat(chatContext, projectId);
      useTokenTracker.getState().resetSession();
    },
    [chatContext, goToChat, startNewChat],
  );

  const handleSelect = useCallback(
    (session: SessionMeta) => {
      setRenamingSessionId(null);
      // 点会话一律先回对话页：否则在资产页点左栏只是改了状态，看上去毫无反应。
      // 深链上则换成新对话的深链（见 goToChat）。
      goToChat(session.id);
      if (session.kind === "floating") {
        useFloatingChats.getState().restoreWindow(session.id);
        return;
      }
      // 点进某个项目的会话，就把「下次新建」的落点也切到那个项目（与最近项目一致）。
      // 系统项目会话（note / scheduled）不动落点：它们的归属由来源决定，不是用户选的。
      setActiveProject(session.kind === "note" || session.kind === "scheduled" ? null : (session.folderId ?? null));
      switchSession(session.id);
    },
    [goToChat, setActiveProject, switchSession],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const floating = useFloatingChats.getState();
      const win = floating.windows.find((item) => item.sessionId === id);
      if (win) floating.closeWindow(win.id);
      deleteSession(id);
      setPendingDeleteId(null);
      setMenu(null);
    },
    [deleteSession],
  );

  const openMenu = (event: React.MouseEvent, target: AgentMenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setPendingDeleteId(null);
    setPendingDeleteProjectId(null);
    const eventTarget = event.target instanceof Element ? event.target : null;
    const returnFocusElement = eventTarget?.closest<HTMLElement>("button, a, [tabindex]")
      ?? event.currentTarget as HTMLElement;
    menuReturnFocusRef.current = returnFocusElement;
    setMenu({ x: event.clientX, y: event.clientY, target, returnFocusElement });
  };

  const handleCreateProject = () => {
    const id = createFolder();
    setProjectsExpanded(true);
    setRenamingProjectId(id);
  };

  /** 删除项目：菜单里确认过一次才走到这里；成员对话由 store 退回 Recents。 */
  const handleDeleteProject = useCallback(
    (id: string) => {
      deleteFolder(id);
      setPendingDeleteProjectId(null);
      setMenu(null);
    },
    [deleteFolder],
  );

  const sessionMenuProps = {
    activeSessionId,
    renamingId: renamingSessionId,
    onSelect: handleSelect,
    onContextMenu: (event: React.MouseEvent, session: SessionMeta) => openMenu(event, { kind: "session", session }),
    onRenameSubmit: (id: string, title: string) => {
      const next = title.trim();
      const prev = sessionsMeta.find((session) => session.id === id)?.title ?? "";
      if (next && next !== prev) updateSessionTitle(id, next);
      setRenamingSessionId(null);
    },
    onRenameCancel: () => setRenamingSessionId(null),
  };

  return (
    <aside
      data-testid="agent-conversation-sidebar"
      tabIndex={-1}
      className="flex h-full flex-col"
      style={{
        // 深色下由 CSS 变量改成「中间那一档」（B-A-A 配色）；浅色保持原样。
        background: "var(--agent-sidebar-bg, var(--md-sys-color-surface-container-lowest))",
        borderRight: "1px solid var(--line-soft)",
      }}
      onContextMenu={(event) => openMenu(event, { kind: "panel" })}
    >
      <div
        className="flex shrink-0 items-center gap-1"
        style={{ height: 40, padding: "0 8px 0 12px", borderBottom: "1px solid var(--line-soft)" }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--md-sys-color-outline)",
          }}
        >
          {t("agent.sidebar.title")}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => useGlobalSearch.getState().setOpen(true)}
            title={t("agent.sidebar.search")}
            aria-label={t("agent.sidebar.search")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title={t("agent.sidebar.collapse")}
            aria-label={t("agent.sidebar.collapse")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      <AgentNavRows onNewChat={() => handleNewChat(activeProjectId)} newChatActive={onBlankChat} />

      <div className="scroll-y min-h-0 flex-1 py-1" data-agent-scroll data-testid="agent-conversation-groups">
        {showArchived ? (
          <>
            <AgentSectionHeader
              label={t("agent.sidebar.archived")}
              expanded
              onToggle={() => setShowArchived(false)}
              testId="agent-archived-header"
              action={
                <button
                  type="button"
                  onClick={() => setShowArchived(false)}
                  title={t("agent.sidebar.backToList")}
                  aria-label={t("agent.sidebar.backToList")}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                >
                  <MessagesSquare size={14} />
                </button>
              }
            />
            <AgentSessionList
              slot="archived"
              sessions={archivedSessions}
              emptyLabel={t("agent.sidebar.empty.archived")}
              depth={1}
              {...sessionMenuProps}
            />
          </>
        ) : (
          <>
            <AgentSectionHeader
              label={t("agent.sidebar.projects")}
              expanded={projectsExpanded}
              onToggle={() => setProjectsExpanded((open) => !open)}
              testId="agent-projects"
              action={
                <button
                  type="button"
                  data-testid="agent-project-add"
                  onClick={handleCreateProject}
                  title={t("agent.sidebar.newProject")}
                  aria-label={t("agent.sidebar.newProject")}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                >
                  <Plus size={14} />
                </button>
              }
            />
            <AnimatedCollapse isOpen={projectsExpanded}>
              {projects.map((project) => {
                const expanded = collapsedProjects[project.id] !== true;
                const emptyLabel = !project.system
                  ? t("agent.sidebar.empty.project")
                  : project.system === "note"
                    ? t("agent.sidebar.empty.notes")
                    : project.system === "floating"
                      ? t("agent.sidebar.empty.selection")
                      : t("agent.sidebar.empty.scheduled");
                return (
                  <div key={project.id}>
                    <div
                      className="group flex items-center"
                      onContextMenu={(event) =>
                        openMenu(event, {
                          kind: "project",
                          folder: { id: project.id, name: project.name, createdAt: project.updatedAt, system: project.system },
                        })
                      }
                    >
                      <div className="min-w-0 flex-1">
                        {renamingProjectId === project.id ? (
                          <input
                            autoFocus
                            defaultValue={project.name}
                            aria-label={t("agent.sidebar.project.name")}
                            data-testid="project-rename-input"
                            className="mx-2 my-0.5 w-[calc(100%-1rem)] rounded-md border border-[var(--accent)] bg-[var(--bg-muted)] px-2 py-0.5 text-[12px] text-[var(--ink)] outline-none"
                            onPointerDown={(event) => event.stopPropagation()}
                            // 新建项目时输入框里是「新建项目 N」这个临时名：全选一下，直接打字就是干净的名字。
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={(event) => {
                              renameFolder(project.id, event.target.value);
                              setRenamingProjectId(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                renameFolder(project.id, event.currentTarget.value);
                                setRenamingProjectId(null);
                              }
                              if (event.key === "Escape") setRenamingProjectId(null);
                            }}
                          />
                        ) : (
                          <FolderTreeRow
                            depth={0}
                            title={project.name}
                            isFolder
                            isExpanded={expanded}
                            icon={
                              expanded ? (
                                <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                              ) : (
                                <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
                              )
                            }
                            onClick={() => setCollapsedProjects((prev) => ({ ...prev, [project.id]: expanded }))}
                            fontWeight={600}
                            ariaLabel={project.name}
                          />
                        )}
                      </div>
                      {/**
                       * 项目行右侧的「+」：直接在这个项目里开一条新对话（用户口径：跟 Projects 那行右侧的加号一个意思）。
                       * **常显**而不是悬停才现：它是这个项目最主要的动作，藏起来用户根本不知道有。
                       * 系统项目（笔记记录 / 划词摘录）的成员由会话 kind 决定，手动新建挂不进去，所以不给。
                       * 重命名时也藏起来，免得和输入框抢焦点。
                       */}
                      {/* 折叠时把成员会话的运行态聚成一颗徽标；展开后每行自己有徽标。 */}
                      {!expanded ? <SessionRunBadge run={aggregateProjectRun(project.sessions, runsById)} /> : null}
                      {!project.system && renamingProjectId !== project.id ? (
                        <button
                          type="button"
                          data-testid={`agent-project-new-chat-${project.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleNewChat(project.id);
                          }}
                          title={t("agent.sidebar.project.newChat", { name: project.name })}
                          aria-label={t("agent.sidebar.project.newChat", { name: project.name })}
                          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--ink)]"
                        >
                          <Plus size={13} />
                        </button>
                      ) : null}
                    </div>
                    <AnimatedCollapse isOpen={expanded}>
                      <AgentSessionList
                        slot={`project-${project.id}`}
                        sessions={project.sessions}
                        emptyLabel={emptyLabel}
                        depth={1}
                        {...sessionMenuProps}
                      />
                    </AnimatedCollapse>
                  </div>
                );
              })}
            </AnimatedCollapse>

            <AgentSectionHeader
              label={t("agent.sidebar.recents")}
              expanded={recentsExpanded}
              onToggle={() => setRecentsExpanded((open) => !open)}
              testId="agent-recents"
            />
            <AnimatedCollapse isOpen={recentsExpanded}>
              <AgentSessionList slot="main" sessions={recentSessions} emptyLabel={t("agent.sidebar.empty.recents")} depth={1} {...sessionMenuProps} />
            </AnimatedCollapse>
          </>
        )}
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        style={{ height: 40, padding: "0 8px", borderTop: "1px solid var(--line-soft)" }}
      >
        <LeftDock
          buttonRef={settingsBtnRef}
          settingsOpen={settingsOpen}
          onToggle={() => setSettingsOpen((open) => !open)}
        />
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          title={showArchived ? t("agent.sidebar.backToList") : t("agent.sidebar.viewArchived")}
          aria-label={showArchived ? t("agent.sidebar.backToList") : t("agent.sidebar.viewArchived")}
          aria-pressed={showArchived}
          data-testid="archived-toggle"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-container-high)]"
        >
          {showArchived ? <MessagesSquare size={15} /> : <Archive size={15} />}
        </button>
      </div>

      {settingsOpen && (
        <GlobalSettings anchorRef={settingsBtnRef} onClose={() => setSettingsOpen(false)} />
      )}

      {menu && (
        <AgentPanelMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          userProjects={userProjects}
          pendingDeleteId={pendingDeleteId}
          pendingDeleteProjectId={pendingDeleteProjectId}
          onRequestDelete={setPendingDeleteId}
          onConfirmDelete={handleDelete}
          onCancelDelete={() => setPendingDeleteId(null)}
          onRequestDeleteProject={setPendingDeleteProjectId}
          onConfirmDeleteProject={handleDeleteProject}
          onCancelDeleteProject={() => setPendingDeleteProjectId(null)}
          close={closeMenu}
          returnFocusElement={menu.returnFocusElement}
          actions={{
            newChat: () => handleNewChat(activeProjectId),
            newProject: handleCreateProject,
            renameSession: (id) => setRenamingSessionId(id),
            moveSession: (id, projectId) => moveSessionToFolder(id, projectId),
            archiveSession: (id, archived) => archiveSession(id, archived),
            renameProject: (id) => setRenamingProjectId(id),
            newChatInProject: (id) => handleNewChat(id),
          }}
        />
      )}
    </aside>
  );
}
