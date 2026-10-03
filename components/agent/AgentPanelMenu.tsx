"use client";

import { Archive, ChevronRight, Folder, FolderPlus, PenLine, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ChatFolder, SessionMeta } from "@/lib/storage/chatStorage";
import { AGENT_MENU_ITEM_CLASS, AgentMenuSurface } from "./AgentMenuSurface";

export type AgentMenuTarget =
  | { kind: "panel" }
  | { kind: "session"; session: SessionMeta }
  | { kind: "project"; folder: ChatFolder };

export interface AgentPanelMenuActions {
  newChat: () => void;
  newProject: () => void;
  renameSession: (id: string) => void;
  moveSession: (id: string, projectId: string | null) => void;
  archiveSession: (id: string, archived: boolean) => void;
  renameProject: (id: string) => void;
  newChatInProject: (id: string) => void;
}

const ITEM_CLASS = AGENT_MENU_ITEM_CLASS;

/**
 * 左栏右键菜单。删除走「菜单里就地问一次」：先点删除，再点确认，确认才真的落 deleteSession
 * （那条路径会 tombstone 云端那一行）。系统项目的会话不给「移动到项目」——归属由来源决定。
 */
export default function AgentPanelMenu({
  x,
  y,
  target,
  userProjects,
  pendingDeleteId,
  pendingDeleteProjectId,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRequestDeleteProject,
  onConfirmDeleteProject,
  onCancelDeleteProject,
  close,
  returnFocusElement,
  actions,
}: {
  x: number;
  y: number;
  target: AgentMenuTarget;
  userProjects: ChatFolder[];
  pendingDeleteId: string | null;
  /** 待确认删除的项目 id：项目删除同样要二次确认（与对话删除一致）。 */
  pendingDeleteProjectId: string | null;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onRequestDeleteProject: (id: string) => void;
  onConfirmDeleteProject: (id: string) => void;
  onCancelDeleteProject: () => void;
  close: (restoreFocus?: boolean) => void;
  returnFocusElement?: HTMLElement | null;
  actions: AgentPanelMenuActions;
}) {
  const t = useT();
  const session = target.kind === "session" ? target.session : null;
  const systemSession = session?.kind === "note" || session?.kind === "floating" || session?.kind === "scheduled";

  return (
    <AgentMenuSurface
      id="agent-panel-menu"
      x={x}
      y={y}
      label={t("agent.menu.aria")}
      testId="agent-panel-menu"
      onClose={close}
      returnFocusElement={returnFocusElement}
    >
      {target.kind === "panel" && (
        <>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => { actions.newChat(); close(); }}>
            <PenLine size={14} className="text-[var(--md-sys-color-primary)]" />
            {t("agent.menu.newChat")}
          </button>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => { actions.newProject(); close(); }}>
            <FolderPlus size={14} className="text-[var(--md-sys-color-primary)]" />
            {t("agent.sidebar.newProject")}
          </button>
        </>
      )}

      {target.kind === "project" && (
        <>
          <div className="truncate px-2.5 py-1 text-[11px] text-[var(--ink-faint)]">{target.folder.name}</div>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => { actions.newChatInProject(target.folder.id); close(); }}>
            <PenLine size={14} className="text-[var(--md-sys-color-primary)]" />
            {t("agent.menu.newChatInProject")}
          </button>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => { actions.renameProject(target.folder.id); close(); }}>
            <PenLine size={14} />
            {t("agent.sidebar.project.rename")}
          </button>
          {target.folder.system ? null : pendingDeleteProjectId === target.folder.id ? (
            <div
              data-testid="project-delete-confirm"
              className="mt-1 rounded-lg border border-[color-mix(in_srgb,var(--md-sys-color-error)_45%,transparent)] p-2"
            >
              <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-error)]">
                {t("agent.menu.deleteProjectConfirm")}
              </p>
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
                  onClick={onCancelDeleteProject}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[var(--md-sys-color-error)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--md-sys-color-on-error)]"
                  onClick={() => onConfirmDeleteProject(target.folder.id)}
                >
                  {t("agent.menu.deleteProject")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={`${ITEM_CLASS} text-[var(--md-sys-color-error)]`}
              onClick={() => onRequestDeleteProject(target.folder.id)}
            >
              <Trash2 size={14} />
              {t("agent.menu.deleteProject")}
            </button>
          )}
        </>
      )}

      {session && (
        <>
          <div className="truncate px-2.5 py-1 text-[11px] text-[var(--ink-faint)]">{session.title || t("agent.session.untitled")}</div>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => { actions.renameSession(session.id); close(); }}>
            <PenLine size={14} />
            {t("agent.menu.renameSession")}
          </button>
          {!systemSession && userProjects.length > 0 && (
            <>
              <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] text-[var(--ink-faint)]">{t("agent.menu.moveToProject")}</div>
              {userProjects.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                  onClick={() => { actions.moveSession(session.id, folder.id); close(); }}
                >
                  <Folder size={13} />
                  {folder.name}
                </button>
              ))}
              {session.folderId ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                  onClick={() => { actions.moveSession(session.id, null); close(); }}
                >
                  <ChevronRight size={13} />
                  {t("agent.menu.removeFromProject")}
                </button>
              ) : null}
            </>
          )}
          {systemSession ? (
            <p className="px-2.5 pb-1 pt-0.5 text-[10.5px] leading-relaxed text-[var(--ink-faint)]">
              {session.kind === "note"
                ? t("agent.menu.systemNote")
                : session.kind === "scheduled"
                  ? t("agent.menu.systemScheduled")
                  : t("agent.menu.systemFloating")}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLASS}
            onClick={() => { actions.archiveSession(session.id, true); close(); }}
          >
            <Archive size={14} className="text-[var(--md-sys-color-primary)]" />
            {t("agent.menu.archive")}
          </button>
        </>
      )}

      {pendingDeleteId ? (
        <div
          data-testid="session-delete-confirm"
          className="mt-1 rounded-lg border border-[color-mix(in_srgb,var(--md-sys-color-error)_45%,transparent)] p-2"
        >
          <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-error)]">
            {t("agent.menu.deleteSessionConfirm")}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
              onClick={onCancelDelete}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--md-sys-color-error)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--md-sys-color-on-error)]"
              onClick={() => onConfirmDelete(pendingDeleteId)}
            >
              {t("agent.menu.confirmDelete")}
            </button>
          </div>
        </div>
      ) : session ? (
        <button
          type="button"
          role="menuitem"
          className={`${ITEM_CLASS} text-[var(--md-sys-color-error)]`}
          onClick={() => onRequestDelete(session.id)}
        >
          <Trash2 size={14} />
          {t("agent.menu.deleteSession")}
        </button>
      ) : null}
    </AgentMenuSurface>
  );
}
