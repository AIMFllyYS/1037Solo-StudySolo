"use client";

import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import ProjectFilesWindow from "./ProjectFilesWindow";

/** 项目文件窗层：一个项目一个窗，按窗口管理器里的记录渲染（与其它窗层同构）。 */
export default function ProjectFilesLayer() {
  const windows = useWindowManager((s) => s.windows);
  const open = windows.filter((win) => win.type === "project-files");
  if (open.length === 0) return null;
  return (
    <>
      {open.map((win) => {
        const projectId = (win.data as { projectId?: string }).projectId;
        if (!projectId) return null;
        return <ProjectFilesWindow key={win.id} projectId={projectId} />;
      })}
    </>
  );
}