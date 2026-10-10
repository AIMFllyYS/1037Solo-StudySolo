import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import type { AttachmentPreviewData } from "@/lib/stores/workspace/windowManager";

export function attachmentPreviewWindowId(key: string) {
  return `attachment-preview:${key}`;
}

export function openAttachmentPreview(key: string, data: AttachmentPreviewData) {
  if (!data.content && !data.localFileId) return;
  const id = attachmentPreviewWindowId(key);
  const windows = useWindowManager.getState();
  const existing = windows.windows.find((win) => win.id === id);
  if (existing) {
    windows.updateWindow(id, { title: data.name, data });
    if (existing.minimized) windows.restoreWindow(id);
    else windows.bringToFront(id);
    return;
  }

  const { pos, size } = attachmentPreviewGeometry();
  windows.openWindow({
    id,
    type: "attachment-preview",
    title: data.name,
    pos,
    size,
    data,
  });
}

function attachmentPreviewGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 96, y: 72 }, size: { width: 760, height: 560 } };
  }
  const openCount = useWindowManager
    .getState()
    .windows.filter((win) => win.type === "attachment-preview" && !win.minimized).length;
  const offset = openCount * 24;
  const width = Math.min(820, Math.max(420, Math.floor(window.innerWidth * 0.62)));
  const height = Math.min(680, Math.max(360, Math.floor(window.innerHeight * 0.72)));
  return {
    pos: {
      x: Math.max(16, Math.floor((window.innerWidth - width) / 2) + offset),
      y: Math.max(16, Math.floor((window.innerHeight - height) / 2) + offset),
    },
    size: { width, height },
  };
}
