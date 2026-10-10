import { Folder, FolderOpen, Plus } from "lucide-react";

import FolderTreeRow from "@/components/layout/navigation/FolderTreeRow";

import AgentSessionList from "@/components/agent/AgentSessionList";
import { SessionRunBadge } from "@/components/agent/AgentSessionRow";
import { type AgentMenuTarget } from "@/components/agent/AgentPanelMenu";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { useT } from "@/lib/i18n";

import { type SessionRunRecord } from "@/lib/stores/chat/sessionRuns";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { AgentProjectView } from "@/lib/agent/projectViews";
import { aggregateProjectRun } from "@/lib/agent/projectRuns";
type AgentProjectGroupProps = {
 project: AgentProjectView; searching: boolean;
 collapsedProjects: Record<string, boolean>; renamingProjectId: string | null;
 runsById: Record<string, SessionRunRecord>;
 renameFolder: (id: string, name: string) => void;
 setRenamingProjectId: (id: string | null) => void;
 setCollapsedProjects: Dispatch<SetStateAction<Record<string, boolean>>>;
 handleNewChat: (projectId?: string | null) => void;
 openMenu: (event: React.MouseEvent, target: AgentMenuTarget) => void;
 sessionMenuProps: Pick<ComponentProps<typeof AgentSessionList>, "activeSessionId" | "renamingId" | "onSelect" | "onContextMenu" | "onRenameSubmit" | "onRenameCancel">;
};
export default function AgentProjectGroup({ project, searching, collapsedProjects, renamingProjectId, runsById, renameFolder, setRenamingProjectId, setCollapsedProjects, handleNewChat, openMenu, sessionMenuProps }: AgentProjectGroupProps) {
const t = useT();

                const expanded = searching || collapsedProjects[project.id] !== true;
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
                            className="my-0.5 h-[28px] w-full rounded-lg border border-[var(--accent)] bg-[var(--bg-muted)] px-2.5 text-[12.5px] text-[var(--ink)] outline-none"
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
                            inset
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
                            endAdornment={!expanded ? <SessionRunBadge run={aggregateProjectRun(project.sessions, runsById)} /> : undefined}
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
                          className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--ink)]"
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
                        inFolder
                        {...sessionMenuProps}
                      />
                    </AnimatedCollapse>
                  </div>
                );

}
