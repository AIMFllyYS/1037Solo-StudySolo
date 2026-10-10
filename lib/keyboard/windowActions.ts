import { useWindowManager, type ManagedWindow, type ImageGenViewerData } from "@/lib/stores/workspace/windowManager";
import { useFloatingChats } from "@/lib/stores/chat/floatingChats";
import { useArtifacts } from "@/lib/stores/assets/artifacts";
import { useImageGen } from "@/lib/stores/assets/imageGen";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { useDocuments } from "@/lib/stores/assets/documents";
import { useNoteCitations } from "@/lib/stores/learning/noteCitations";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import { useAgentProductPicker } from "@/lib/stores/workspace/agentProductPicker";
import { useMemoryInbox } from "@/lib/stores/learning/memoryInbox";
import { useQuizExplain } from "@/lib/stores/learning/quizExplain";
import type { MemoryProposalData, UserNoteEditorData } from "@/lib/stores/workspace/windowManager";
import { toggleManagedWindowFullscreen } from "@/lib/window/toggleManagedFullscreen";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { useStore } from "@/lib/stores/ui";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";

/** 解析当前应操作的 managed 窗口（activeWindowId 或 z 最高未最小化）。 */
export function getActiveManagedWindow(): ManagedWindow | null {
  const { windows, activeWindowId } = useWindowManager.getState();
  // Agent 右栏收起时不算有前台窗口：快捷键/Esc 不该作用在看不见的窗口上。
  if (isAgentWorkspace() && useStore.getState().agentDockCollapsed) return null;
  if (activeWindowId) {
    const win = windows.find((w) => w.id === activeWindowId);
    if (win && !win.minimized) return win;
  }
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return null;
  return visible.reduce((a, b) => (a.z >= b.z ? a : b));
}

/** 按窗口类型正确关闭（避免只删 managed 记录、遗留 session）。 */
export function closeManagedWindow(win: ManagedWindow): void {
  switch (win.type) {
    case "floating-chat":
      useFloatingChats.getState().closeWindow(win.id);
      break;
    case "artifact-viewer":
      useArtifacts.getState().closeViewer();
      break;
    case "image-gen-viewer": {
      const data = win.data as ImageGenViewerData;
      useImageGen.getState().closeViewer(data.imageGenId);
      break;
    }
    case "record-preview":
      useRecordPreviews.getState().close(win.id);
      break;
    case "document-viewer":
      useDocuments.getState().closeViewer();
      break;
    case "note-citation-viewer":
      useNoteCitations.getState().closeViewer();
      break;
    case "user-note-editor": {
      const data = win.data as UserNoteEditorData;
      useUserNotes.getState().closeEditor(data.noteId);
      break;
    }
    case "user-note-library":
      useUserNotes.getState().closeLibrary();
      break;
    case "flashcard-cite-picker":
      useFlashcardCitations.getState().closePicker();
      break;
    case "agent-product-picker":
      useAgentProductPicker.getState().closePicker();
      break;
    case "memory-proposal": {
      const data = win.data as MemoryProposalData;
      useMemoryInbox.getState().dismiss(data.proposalId);
      break;
    }
    case "quiz-explain":
      useQuizExplain.getState().closeWindow(win.id);
      break;
    default:
      useWindowManager.getState().closeWindow(win.id);
  }
}

export function closeActiveWindow(): boolean {
  const win = getActiveManagedWindow();
  if (!win) return false;
  closeManagedWindow(win);
  return true;
}

export function toggleMinimizeActiveWindow(): boolean {
  const win = getActiveManagedWindow();
  if (!win) return false;
  const { minimizeWindow, restoreWindow } = useWindowManager.getState();
  if (win.minimized) restoreWindow(win.id);
  else minimizeWindow(win.id);
  return true;
}

export function toggleFullscreenActiveWindow(): boolean {
  const win = getActiveManagedWindow();
  if (!win) return false;
  // Agent 右栏没有「浮窗全屏」这个形态：这里的语义与右栏的「全屏 / 缩小」按钮一致。
  if (isAgentWorkspace()) {
    const runtime = useAgentDockRuntime.getState();
    runtime.setDockGlobal(!runtime.dockGlobal);
    return true;
  }
  toggleManagedWindowFullscreen(win.id);
  return true;
}
