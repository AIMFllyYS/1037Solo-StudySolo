"use client";

import { useState } from "react";
import ProjectRequiredDialog from "@/components/project/ProjectRequiredDialog";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { openProjectFiles } from "@/lib/project/openProjectFiles";

/** 所有项目文件入口共用当前会话归属与无项目时的选择流程。 */
export function useProjectFilesEntry() {
  const [projectGateOpen, setProjectGateOpen] = useState(false);
  const openProjectFilesEntry = () => {
    const history = useChatHistory.getState();
    const active = history.sessionsMeta.find((session) => session.id === history.activeSessionId);
    const projectId = active?.folderId ?? history.activeProjectId ?? null;
    if (projectId) openProjectFiles(projectId);
    else setProjectGateOpen(true);
  };
  const projectRequiredDialog = projectGateOpen ? (
    <ProjectRequiredDialog
      onCancel={() => setProjectGateOpen(false)}
      onReady={(projectId) => {
        setProjectGateOpen(false);
        openProjectFiles(projectId);
      }}
    />
  ) : null;
  return { openProjectFilesEntry, projectRequiredDialog };
}
