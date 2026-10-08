import { create } from "zustand";
import { isAgentWorkspace } from "@/lib/stores/workspace";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import type { QuizQuestion } from "@/lib/quiz/types";

export type ManagedWindowType = "floating-chat" | "record-preview" | "artifact-viewer" | "image-gen-viewer" | "billing-dashboard" | "document-viewer" | "note-citation-viewer" | "source-trace-viewer" | "source-preview" | "attachment-preview" | "membership-sponsor" | "user-note-editor" | "user-note-library" | "flashcard-cite-picker" | "agent-product-picker" | "memory-proposal" | "quiz-explain" | "quiz-dock" | "project-files";

export interface WindowPoint {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface FloatingChatData {
  sessionId: string;
  modelId?: string;
}

export interface RecordPreviewData {
  cardId: string;
}

export interface ArtifactViewerData {
  artifactId: string;
}

export interface ImageGenViewerData {
  imageGenId: string;
}

export type BillingDashboardData = Record<string, never>;

export type MembershipSponsorData = Record<string, never>;

export interface DocumentViewerData {
  documentId: string;
}

export interface NoteCitationViewerData {
  activePath: string;
}

export interface SourceTraceViewerData {
  sources: unknown[];
  activeKey?: string;
}

export interface SourcePreviewData {
  url: string;
  title: string;
  iconUrl?: string;
}

export interface UserNoteEditorData {
  noteId: string;
}

export interface UserNoteLibraryData {
  subjectId?: string | null;
  intent?: "browse" | "cite";
}

export interface FlashcardCitePickerData {
  subjectId?: string | null;
  activeCardId?: string;
}

export type AgentProductKind = "document" | "artifact";

export interface AgentProductPickerData {
  kind: AgentProductKind;
}

export interface MemoryProposalData {
  proposalId: string;
}

export interface QuizExplainData {
  sessionId: string;
  modelId?: string;
  questionId: string;
}

/**
 * 右栏出题窗：一次 createQuiz 的题目快照。
 * 一个 quizId 一个窗（id 形如 `quiz-dock:<quizId>`），打开入口见 `lib/quiz-dock/open.ts`。
 */
export interface AgentQuizData {
  quizId: string;
  /** 卷面标题（窗口标题会拼成「出题 · <title>」）。 */
  title: string;
  /** 出题意图：check / diagnose / practice / exam，仅用于展示。 */
  intent?: string;
  questions: QuizQuestion[];
  /** 被丢弃的非法题数。 */
  droppedCount?: number;
}

/** 项目文件窗：一个项目一个窗（同项目单开）。 */
export interface ProjectFilesData {
  projectId: string;
}

export interface AttachmentPreviewData {
  localFileId?: string;
  name: string;
  mimeType: string;
  kind: "image" | "pdf" | "ppt" | "html" | "markdown" | "text" | "docx";
  content: string;
  /**
   * 原始 File（仅 composer 预览路径携带）。content 里的 blob: URL 归 composer 所有、
   * 随时会被回收；预览窗据此自建 object URL 并在卸载时释放（借据模型）。
   */
  file?: File;
}

export type ManagedWindowData = FloatingChatData | RecordPreviewData | ArtifactViewerData | ImageGenViewerData | BillingDashboardData | MembershipSponsorData | DocumentViewerData | NoteCitationViewerData | SourceTraceViewerData | SourcePreviewData | AttachmentPreviewData | UserNoteEditorData | UserNoteLibraryData | FlashcardCitePickerData | AgentProductPickerData | MemoryProposalData | QuizExplainData | AgentQuizData | ProjectFilesData | Record<string, unknown>;

export interface ManagedWindow<TData = ManagedWindowData> {
  id: string;
  type: ManagedWindowType;
  title: string;
  icon?: string;
  pos: WindowPoint;
  size: WindowSize;
  z: number;
  fullscreen: boolean;
  minimized: boolean;
  badge?: number;
  /**
   * 打开这个窗口时所在的对话（Agent 右栏按会话隔离：A 的文档不出现在 B 的右栏）。
   * null/undefined = 不隔离（Studio 打开的、测试构造的旧窗口都按可见处理）。
   */
  sessionId?: string | null;
  /** 进入全屏前的几何，供红绿灯与键盘快捷键还原。 */
  preExpand?: { pos: WindowPoint; size: WindowSize } | null;
  data: TData;
}

export type ManagedWindowInput<TData = ManagedWindowData> = Omit<
  ManagedWindow<TData>,
  "z" | "fullscreen" | "minimized" | "badge"
> &
  Partial<Pick<ManagedWindow<TData>, "fullscreen" | "minimized">>;

function pickNextActiveWindow(windows: ManagedWindow[], closedId: string): string | null {
  const remaining = windows.filter((w) => w.id !== closedId && !w.minimized);
  if (remaining.length === 0) return null;
  return remaining.reduce((a, b) => (a.z >= b.z ? a : b)).id;
}

interface WindowManagerState {
  windows: ManagedWindow[];
  topZ: number;
  activeWindowId: string | null;
  openWindow: <TData = ManagedWindowData>(win: ManagedWindowInput<TData>) => string;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  setActiveWindow: (id: string | null) => void;
  setFullscreen: (id: string, on: boolean) => void;
  bringToFront: (id: string) => void;
  commitGeometry: (id: string, geom: { pos?: WindowPoint; size?: WindowSize }) => void;
  updateWindow: (id: string, patch: Partial<Omit<ManagedWindow, "id" | "type" | "badge">>) => void;
}

function withBadges(windows: ManagedWindow[]): ManagedWindow[] {
  const counts = new Map<ManagedWindowType, number>();
  return windows.map((win) => {
    const badge = (counts.get(win.type) ?? 0) + 1;
    counts.set(win.type, badge);
    return { ...win, badge };
  });
}

/**
 * 「当前对话」的提供者。由外壳注入（AppShell），而不是让 windowManager 直接 import chatHistory ——
 * 那会形成 windowManager → chatHistory → artifacts → windowManager 的循环依赖。
 */
let sessionProvider: (() => string | null) | null = null;

export function setWindowSessionProvider(provider: (() => string | null) | null): void {
  sessionProvider = provider;
}

export const useWindowManager = create<WindowManagerState>((set) => ({
  windows: [],
  topZ: 5000,
  activeWindowId: null,

  openWindow: (input) => {
    set((state) => {
      const existing = state.windows.some((win) => win.id === input.id);
      const z = state.topZ + 1;
      const nextWindow: ManagedWindow = {
        id: input.id,
        type: input.type,
        title: input.title,
        icon: input.icon,
        // Agent dock presentation uses the host layout. Keep the caller's
        // geometry for Studio and for a later mode switch back to floating.
        pos: input.pos,
        size: input.size,
        data: input.data as ManagedWindowData,
        z,
        fullscreen: input.fullscreen ?? false,
        minimized: input.minimized ?? false,
        sessionId: input.sessionId ?? sessionProvider?.() ?? null,
      };
      const windows = existing
        ? state.windows.map((win) => (win.id === input.id ? { ...win, ...nextWindow } : win))
        : [...state.windows, nextWindow];
      return { windows: withBadges(windows), topZ: z, activeWindowId: input.id };
    });
    // Agent 右栏：新内容打开时请求展开（右栏收起状态里也照样弹出来）。
    if (isAgentWorkspace() && !(input.minimized ?? false)) {
      useAgentDockRuntime.getState().requestOpen();
    }
    return input.id;
  },

  closeWindow: (id) => {
    set((state) => {
      const windows = withBadges(state.windows.filter((win) => win.id !== id));
      const activeWindowId =
        state.activeWindowId === id ? pickNextActiveWindow(state.windows, id) : state.activeWindowId;
      return { windows, activeWindowId };
    });
  },

  setActiveWindow: (id) =>
    set((state) => ({
      activeWindowId:
        id === null || state.windows.some((window) => window.id === id && !window.minimized)
          ? id
          : state.activeWindowId,
    })),

  minimizeWindow: (id) => {
    set((state) => {
      const wasActive = state.activeWindowId === id;
      const windows = state.windows.map((win) =>
        win.id === id ? { ...win, minimized: true, fullscreen: false } : win,
      );
      return {
        windows,
        activeWindowId: wasActive ? pickNextActiveWindow(windows, id) : state.activeWindowId,
      };
    });
  },

  restoreWindow: (id) => {
    set((state) => {
      const z = state.topZ + 1;
      return {
        topZ: z,
        activeWindowId: id,
        windows: state.windows.map((win) =>
          win.id === id ? { ...win, minimized: false, z } : win,
        ),
      };
    });
  },

  setFullscreen: (id, on) =>
    set((state) => {
      const z = state.topZ + 1;
      return {
        topZ: z,
        activeWindowId: on ? id : state.activeWindowId,
        windows: state.windows.map((win) => {
          if (win.id === id) return { ...win, fullscreen: on, minimized: false, z };
          if (on && win.fullscreen) return { ...win, fullscreen: false, minimized: true };
          return win;
        }),
      };
    }),

  bringToFront: (id) =>
    set((state) => {
      const z = state.topZ + 1;
      return {
        topZ: z,
        activeWindowId: id,
        windows: state.windows.map((win) => (win.id === id ? { ...win, z } : win)),
      };
    }),

  commitGeometry: (id, geom) =>
    set((state) => ({
      windows: state.windows.map((win) =>
        win.id === id
          ? {
              ...win,
              ...(geom.pos ? { pos: geom.pos } : {}),
              ...(geom.size ? { size: geom.size } : {}),
            }
          : win,
      ),
    })),

  updateWindow: (id, patch) =>
    set((state) => ({
      windows: withBadges(state.windows.map((win) => (win.id === id ? { ...win, ...patch } : win))),
    })),
}));
