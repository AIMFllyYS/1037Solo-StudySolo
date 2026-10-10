"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, FolderPlus } from "lucide-react";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { buildProjectViews, recentProjects } from "@/lib/agent/projectViews";
import { useT } from "@/lib/i18n";

/**
 * 「项目文件」没有项目时的引导弹窗。
 *
 * 以前这里会**悄悄**取最近一个项目、甚至自动建一个「我的项目」再打开窗口 ——
 * 用户看到的是一份不属于当前对话的文件列表，也不知道自己已经被塞进了哪个项目。
 * 现在改成显式问一句：要么建一个新项目、要么把当前对话挪进已有项目，两条路都会
 * 顺手把当前会话挂过去，再打开那个项目的文件窗。
 */
export default function ProjectRequiredDialog({
  onCancel,
  onReady,
}: {
  onCancel: () => void;
  /** 项目已就绪（新建或选中），带着 id 去开窗口。 */
  onReady: (projectId: string) => void;
}) {
  const folders = useChatHistory((s) => s.folders);
  const sessionsMeta = useChatHistory((s) => s.sessionsMeta);
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const createFolder = useChatHistory((s) => s.createFolder);
  const moveSessionToFolder = useChatHistory((s) => s.moveSessionToFolder);
  const setActiveProject = useChatHistory((s) => s.setActiveProject);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const t = useT();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // 只列用户项目：系统项目的成员由会话 kind 决定，挪不进去。
  const projects = recentProjects(buildProjectViews(folders, sessionsMeta), 6);

  /** 新建或选中之后：把当前会话挂过去，并同步「下次新建」的落点。 */
  const adopt = (projectId: string) => {
    setActiveProject(projectId);
    if (activeSessionId) moveSessionToFolder(activeSessionId, projectId);
    onReady(projectId);
  };

  const commitNew = () => {
    const name = draft.trim();
    adopt(createFolder(name || undefined));
  };

  const dialog = (
    <div className="app-dialog-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div role="dialog" aria-modal="true" aria-label={t("window.project.required.aria")} className="app-dialog">
        <div className="project-required-eyebrow">{t("window.project.required.eyebrow")}</div>
        <h2>{t("window.project.required.title")}</h2>
        <p>
          {t("window.project.required.body1")}{" "}
          {t("window.project.required.body2")}
        </p>

        {projects.length > 0 ? (
          <div className="project-required-list" data-testid="project-required-list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                data-testid={`project-required-pick-${project.id}`}
                className="app-menu-item"
                onClick={() => adopt(project.id)}
              >
                <span className="app-menu-check"><Folder size={13} /></span>
                <span>
                  {project.name}
                  <small>{t("window.project.required.sessionCount", { count: project.sessions.length })}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {creating ? (
          <div className="project-required-create">
            <input
              autoFocus
              value={draft}
              aria-label={t("window.project.required.newProjectNameAria")}
              data-testid="project-required-name"
              placeholder={t("window.project.required.projectNamePlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitNew();
                if (event.key === "Escape") setCreating(false);
              }}
              className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none"
            />
            <button
              type="button"
              data-testid="project-required-create-confirm"
              onClick={commitNew}
              className="shrink-0 rounded-md bg-[var(--md-sys-color-primary)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--md-sys-color-on-primary)]"
            >
              {t("window.project.required.createAndUse")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="project-required-create"
            className="app-menu-item project-required-new"
            onClick={() => setCreating(true)}
          >
            <span className="app-menu-check"><FolderPlus size={13} /></span>
            <span>{t("window.project.required.createProject")}<small>{t("window.project.required.createProjectHint")}</small></span>
          </button>
        )}

        <button
          type="button"
          data-testid="project-required-cancel"
          className="project-required-cancel"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
