import { translateNow } from "@/lib/i18n";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

/** 项目文件窗的窗口 id：一个项目一个窗。 */
export function projectFilesWindowId(projectId: string): string {
  return `project-files:${projectId}`;
}

function geometry() {
  if (typeof window === "undefined") return { pos: { x: 24, y: 64 }, size: { width: 900, height: 680 } };
  return {
    pos: { x: Math.max(16, Math.floor(window.innerWidth * 0.06)), y: Math.max(16, Math.floor(window.innerHeight * 0.06)) },
    size: {
      width: Math.min(1000, Math.floor(window.innerWidth * 0.78)),
      height: Math.min(760, Math.floor(window.innerHeight * 0.86)),
    },
  };
}

/**
 * 打开某个项目的「项目文件」窗（Agent 右栏的 managed window）。
 * 从加号菜单、「我的资产」等入口都走这里，不要各自拼窗口 id。
 */
export function openProjectFiles(projectId: string): string {
  const { pos, size } = geometry();
  return useWindowManager.getState().openWindow({
    id: projectFilesWindowId(projectId),
    type: "project-files",
    // 与加号菜单里的入口同名（panel.addMenu.projectFiles）；开窗即翻，见 translateNow 的 doc。
    title: translateNow("panel.addMenu.projectFiles"),
    pos,
    size,
    data: { projectId },
  });
}