import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { createPersistedStore } from "@/lib/stores/_persist";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import {
  BLANK_NOTE_MARKDOWN,
  deriveNoteTitle,
  EXAMPLE_USER_NOTE_ID,
  isClassroomNote,
  seedExampleNoteIfEmpty,
  subjectLabel,
  USER_NOTE_LIBRARY_WINDOW_ID,
  userNoteWindowId,
  type ClassroomNoteSource,
  type NoteLibraryIntent,
  type UserNote,
  type UserNoteKind,
} from "@/lib/notes/userNote";
import { notifyUserNoteChanged } from "@/lib/notes/userNoteSync";
import { carryUserNoteSearchFields } from "@/lib/notes/userNoteSearch";
import { stripUserNoteWindowState } from "@/lib/stores/workspace/windowPersist";
import { useToast } from "@/lib/stores/toast";

// 个人笔记仓库（IndexedDB 持久化，复用 useReviewCards / useDocuments 范式）。
// 本机 IndexedDB 为真相源。云同步走 notifyUserNoteChanged（SYNC POINT），
// 不在本文件扩展 CLOUD_SYNC_KINDS / 额度统计。
//
// 窗口态（openEditorIds / library*）不持久化：窗口管理器本身也不持久化，
// 刷新后重开窗口比恢复一堆空壳窗口更符合预期。

const genId = () => Math.random().toString(36).slice(2, 11);
const NOTE_LIBRARY_REFRESH_MS = 500;

/** 笔记正文/标题/学科的增量补丁。 */
export interface UserNotePatch {
  title?: string;
  markdown?: string;
  subjectId?: string | null;
  quote?: string;
  source?: ClassroomNoteSource;
}

export interface CreateUserNoteInit {
  title?: string;
  markdown?: string;
  kind?: UserNoteKind;
  quote?: string;
  source?: ClassroomNoteSource;
}

export interface OpenEditorOptions {
  anchor?: { x: number; y: number };
}

export interface OpenNoteLibraryOptions {
  subjectId?: string | null;
  intent?: NoteLibraryIntent;
}

interface UserNotesState {
  byId: Record<string, UserNote>;
  /** 创建顺序（旧 → 新）。 */
  order: string[];
  /** Non-persistent list/search revision; content edits are throttled to keep the tree responsive. */
  libraryRevision: number;
  /** 已打开的编辑器窗口对应的笔记 id（可多开）。 */
  openEditorIds: string[];
  /** 本轮打开期间改过标题/正文/学科的编辑窗。不持久化；关窗时提示一次。 */
  dirtyEditorIds: string[];
  /** 引用到右侧主 Agent 后，主对话本轮可 updateUserNote 的那篇笔记；关掉编辑器后清空。 */
  agentEditingNoteId: string | null;
  setAgentEditingNoteId: (id: string | null) => void;
  /** 编辑窗内展开了微型 Agent 面板的笔记。不持久化。 */
  noteAgentOpenIds: string[];
  setNoteAgentOpen: (id: string, open: boolean) => void;
  /** 每篇笔记自己的干净会话；随笔记持久化，重开窗可续聊。 */
  noteAgentSessionById: Record<string, string>;
  ensureNoteAgentSession: (id: string) => string | null;
  libraryOpen: boolean;
  libraryIntent: NoteLibraryIntent;
  librarySubjectId: string | null;
  /** 笔记库左侧文件夹树选中的学科；null = 全部。 */
  setLibrarySubjectId: (subjectId: string | null) => void;
  /** IndexedDB 异步水合完成标志。 */
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;
  /** Non-persistent owner epoch whose note partition finished hydration. */
  _hydratedOwnerEpoch: number;
  _setHydratedOwnerEpoch: (epoch: number) => void;

  /** 新建一篇笔记（不开窗），返回笔记 id。可带入 Agent 沉淀的短提纲。无 init 时正文空白。 */
  createNote: (subjectId: string | null, init?: CreateUserNoteInit) => string;
  /** 库为空时 seed 一篇案例笔记；已有笔记则跳过。 */
  ensureExampleNote: () => string | null;
  /** 改标题 / 正文 / 学科；未手动改过标题时标题跟随正文首个标题。 */
  updateNote: (id: string, patch: UserNotePatch) => void;
  /** 删除笔记，并关掉它可能打开着的编辑器窗口。 */
  removeNote: (id: string) => void;
  /** 打开编辑器；已打开则前置（最小化的先还原）。课堂便签用小便签几何。 */
  openEditor: (id: string, opts?: OpenEditorOptions) => void;
  closeEditor: (id: string) => void;
  openLibrary: (opts?: OpenNoteLibraryOptions) => void;
  closeLibrary: () => void;
}

/** 按更新时间倒序取笔记；subjectId 为 string 时只取该科，null/undefined 取全部。 */
export function selectUserNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
): UserNote[] {
  return order
    .map((id) => byId[id])
    .filter((note): note is UserNote => Boolean(note))
    .filter((note) => (subjectId == null ? true : note.subjectId === subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 选择笔记（cite）列表：当前筛选下若看不到案例，补进来当默认可见示例。
 * 不改变用户笔记排序；案例未归档时在学科筛选里仍能看见。
 */
export function selectLibraryNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
  opts?: { includeExample?: boolean },
): UserNote[] {
  const notes = selectUserNotes(byId, order, subjectId).filter((note) => !isClassroomNote(note));
  if (!opts?.includeExample) return notes;
  const example = byId[EXAMPLE_USER_NOTE_ID];
  if (!example || notes.some((note) => note.id === example.id)) return notes;
  return [...notes, example].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 选择笔记 · 课堂笔记栏：只列划词便签，不混进个人长笔记。 */
export function selectClassroomNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
): UserNote[] {
  return selectUserNotes(byId, order, subjectId).filter((note) => isClassroomNote(note));
}

function stickyNoteGeometry(anchor?: { x: number; y: number }) {
  const width = 360;
  const height = 328;
  if (typeof window === "undefined") {
    return { pos: { x: 48, y: 80 }, size: { width, height } };
  }
  const x = anchor
    ? Math.min(Math.max(Math.round(anchor.x - width / 2), 16), window.innerWidth - width - 16)
    : Math.max(16, Math.floor(window.innerWidth * 0.18));
  const y = anchor
    ? Math.min(Math.max(Math.round(anchor.y + 10), 16), window.innerHeight - height - 16)
    : Math.max(16, Math.floor(window.innerHeight * 0.16));
  return { pos: { x, y }, size: { width, height } };
}

/** Review-origin classroom notes use the full workspace; other classroom notes remain sticky. */
function reviewSelectionNoteGeometry(anchor?: { x: number; y: number }) {
  if (typeof window === "undefined") {
    return { pos: { x: 40, y: 48 }, size: { width: 1120, height: 760 } };
  }
  const width = Math.max(240, Math.min(1240, window.innerWidth - 32));
  const height = Math.max(240, Math.min(820, window.innerHeight - 32));
  const x = anchor
    ? Math.min(Math.max(Math.round(anchor.x - width / 2), 16), Math.max(16, window.innerWidth - width - 16))
    : Math.max(16, Math.floor((window.innerWidth - width) / 2));
  const y = anchor
    ? Math.min(Math.max(Math.round(anchor.y - height * 0.42), 16), Math.max(16, window.innerHeight - height - 16))
    : Math.max(16, Math.floor((window.innerHeight - height) / 2));
  return { pos: { x, y }, size: { width, height } };
}

function editorWindowGeometry(openCount: number) {
  if (typeof window === "undefined") {
    return { pos: { x: 40, y: 72 }, size: { width: 900, height: 680 } };
  }
  const width = Math.min(960, Math.floor(window.innerWidth * 0.72));
  const height = Math.min(760, Math.floor(window.innerHeight * 0.86));
  const offset = (openCount % 6) * 26;
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.1) + offset),
      y: Math.max(16, Math.floor(window.innerHeight * 0.06) + offset),
    },
    size: { width, height },
  };
}

function libraryWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 32, y: 64 }, size: { width: 860, height: 640 } };
  }
  const width = Math.min(880, Math.floor(window.innerWidth * 0.7));
  const height = Math.min(720, Math.floor(window.innerHeight * 0.84));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.14)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.08)),
    },
    size: { width, height },
  };
}

function libraryTitle(intent: NoteLibraryIntent, subjectId: string | null): string {
  if (intent === "cite") return "选择笔记";
  return subjectId ? `笔记 · ${subjectLabel(subjectId)}` : "笔记";
}

export const useUserNotes = createPersistedStore<UserNotesState>(
  (set, get) => ({
    byId: {},
    order: [],
    libraryRevision: 0,
    openEditorIds: [],
    dirtyEditorIds: [],
    agentEditingNoteId: null,
    setAgentEditingNoteId: (id) => set({ agentEditingNoteId: id }),
    noteAgentOpenIds: [],
    setNoteAgentOpen: (id, open) =>
      set((s) => {
        if (!s.byId[id]) return s;
        const has = s.noteAgentOpenIds.includes(id);
        if (open === has) return s;
        return {
          noteAgentOpenIds: open
            ? [...s.noteAgentOpenIds, id]
            : s.noteAgentOpenIds.filter((item) => item !== id),
        };
      }),
    noteAgentSessionById: {},
    ensureNoteAgentSession: (id) => {
      if (!get().byId[id]) return null;
      const existing = get().noteAgentSessionById[id];
      const history = useChatHistory.getState();
      if (existing && history.sessionsMeta.some((session) => session.id === existing)) {
        return existing;
      }
      const sessionId = history.createSession(undefined, "note");
      const title = get().byId[id]?.title.trim() || "笔记对话";
      history.updateSessionTitle(sessionId, title);
      set((s) => ({
        noteAgentSessionById: { ...s.noteAgentSessionById, [id]: sessionId },
      }));
      return sessionId;
    },
    libraryOpen: false,
    libraryIntent: "browse",
    librarySubjectId: null,
    _hasHydrated: false,
    _setHasHydrated: (v) => set({ _hasHydrated: v }),
    _hydratedOwnerEpoch: -1,
    _setHydratedOwnerEpoch: (epoch) => set({ _hydratedOwnerEpoch: epoch }),

    createNote: (subjectId, init) => {
      const id = genId();
      const now = Date.now();
      const markdown = init?.markdown?.trim() ? init.markdown : BLANK_NOTE_MARKDOWN;
      const kind: UserNoteKind = init?.kind === "classroom" ? "classroom" : "personal";
      const quote = init?.quote?.trim() || undefined;
      const title = init?.title?.trim() || deriveNoteTitle(quote || markdown);
      const note: UserNote = {
        id,
        title,
        markdown,
        subjectId,
        createdAt: now,
        updatedAt: now,
        kind,
        quote,
        source: init?.source,
      };
      set((s) => ({
        byId: { ...s.byId, [id]: note },
        order: [...s.order, id],
        libraryRevision: s.libraryRevision + 1,
      }));
      notifyUserNoteChanged(id, "upsert");
      return id;
    },

    ensureExampleNote: () => {
      const seeded = seedExampleNoteIfEmpty(get().byId, get().order);
      if (!seeded) return get().byId[EXAMPLE_USER_NOTE_ID]?.id ?? null;
      set((s) => ({ ...seeded, libraryRevision: s.libraryRevision + 1 }));
      notifyUserNoteChanged(EXAMPLE_USER_NOTE_ID, "upsert");
      return EXAMPLE_USER_NOTE_ID;
    },

    updateNote: (id, patch) => {
      const prev = get().byId[id];
      if (!prev) return;
      const markdown = patch.markdown ?? prev.markdown;
      // 标题「自动跟随」：空标题，或仍等于旧正文推导出的标题，视为用户没手动改过。
      const autoTitled = !prev.title.trim() || prev.title === deriveNoteTitle(prev.markdown);
      const title =
        patch.title !== undefined
          ? patch.title
          : patch.markdown !== undefined && autoTitled
            ? deriveNoteTitle(markdown)
            : prev.title;
      const subjectId = patch.subjectId !== undefined ? patch.subjectId : prev.subjectId;
      const quote = patch.quote !== undefined ? patch.quote : prev.quote;
      const source = patch.source !== undefined ? patch.source : prev.source;
      if (
        title === prev.title &&
        markdown === prev.markdown &&
        subjectId === prev.subjectId &&
        quote === prev.quote &&
        source === prev.source
      ) {
        return;
      }

      const now = Date.now();
      const next: UserNote = { ...prev, title, markdown, subjectId, quote, source, updatedAt: now };
      carryUserNoteSearchFields(prev, next);
      const forceLibraryRefresh = patch.title !== undefined || subjectId !== prev.subjectId;
      set((s) => ({
        byId: { ...s.byId, [id]: next },
        ...(forceLibraryRefresh ? { libraryRevision: s.libraryRevision + 1 } : {}),
        dirtyEditorIds:
          s.openEditorIds.includes(id) && !(s.dirtyEditorIds ?? []).includes(id)
            ? [...(s.dirtyEditorIds ?? []), id]
            : (s.dirtyEditorIds ?? []),
      }));
      notifyUserNoteChanged(id, "upsert");
      if (next.title !== prev.title) {
        useWindowManager.getState().updateWindow(userNoteWindowId(id), {
          title: next.title || "无标题笔记",
        });
      }
    },

    removeNote: (id) => {
      if (!get().byId[id]) return;
      const sessionId = get().noteAgentSessionById[id];
      if (sessionId) useChatHistory.getState().deleteSession(sessionId);
      useWindowManager.getState().closeWindow(userNoteWindowId(id));
      notifyUserNoteChanged(id, "tombstone");
      set((s) => {
        const byId = { ...s.byId };
        delete byId[id];
        const noteAgentSessionById = { ...s.noteAgentSessionById };
        delete noteAgentSessionById[id];
        return {
          byId,
          order: s.order.filter((x) => x !== id),
          libraryRevision: s.libraryRevision + 1,
          openEditorIds: s.openEditorIds.filter((x) => x !== id),
          dirtyEditorIds: (s.dirtyEditorIds ?? []).filter((x) => x !== id),
          noteAgentOpenIds: s.noteAgentOpenIds.filter((x) => x !== id),
          noteAgentSessionById,
          agentEditingNoteId: s.agentEditingNoteId === id ? null : s.agentEditingNoteId,
        };
      });
    },

    openEditor: (id, opts) => {
      const note = get().byId[id];
      if (!note) return;
      const winId = userNoteWindowId(id);
      const manager = useWindowManager.getState();
      const existing = manager.windows.find((win) => win.id === winId);
      if (existing) {
        if (existing.minimized) manager.restoreWindow(winId);
        else manager.bringToFront(winId);
      } else {
        const classroom = isClassroomNote(note);
        const reviewSelection = classroom && note.source?.kind === "review";
        const { pos, size } = reviewSelection
          ? reviewSelectionNoteGeometry(opts?.anchor)
          : classroom
            ? stickyNoteGeometry(opts?.anchor)
            : editorWindowGeometry(get().openEditorIds.length);
        manager.openWindow({
          id: winId,
          type: "user-note-editor",
          title: classroom ? note.title || "课堂笔记" : note.title || "无标题笔记",
          pos,
          size,
          data: { noteId: id },
        });
      }
      set((s) => ({
        openEditorIds: s.openEditorIds.includes(id) ? s.openEditorIds : [...s.openEditorIds, id],
      }));
    },

    closeEditor: (id) => {
      const dirty = (get().dirtyEditorIds ?? []).includes(id);
      useWindowManager.getState().closeWindow(userNoteWindowId(id));
      set((s) => ({
        openEditorIds: s.openEditorIds.filter((x) => x !== id),
        dirtyEditorIds: (s.dirtyEditorIds ?? []).filter((x) => x !== id),
        noteAgentOpenIds: s.noteAgentOpenIds.filter((x) => x !== id),
        agentEditingNoteId: s.agentEditingNoteId === id ? null : s.agentEditingNoteId,
      }));
      if (dirty) useToast.getState().showSaved();
    },

    setLibrarySubjectId: (subjectId) => {
      const intent = get().libraryIntent;
      useWindowManager.getState().updateWindow(USER_NOTE_LIBRARY_WINDOW_ID, {
        title: libraryTitle(intent, subjectId),
        data: { subjectId, intent },
      });
      set({ librarySubjectId: subjectId });
    },

    openLibrary: (opts) => {
      get().ensureExampleNote();
      const subjectId = opts?.subjectId ?? null;
      const intent: NoteLibraryIntent = opts?.intent ?? "browse";
      const { pos, size } = libraryWindowGeometry();
      useWindowManager.getState().openWindow({
        id: USER_NOTE_LIBRARY_WINDOW_ID,
        type: "user-note-library",
        title: libraryTitle(intent, subjectId),
        pos,
        size,
        data: { subjectId, intent },
      });
      set({ libraryOpen: true, libraryIntent: intent, librarySubjectId: subjectId });
    },

    closeLibrary: () => {
      useWindowManager.getState().closeWindow(USER_NOTE_LIBRARY_WINDOW_ID);
      set({ libraryOpen: false });
    },
  }),
  {
    name: PERSIST_KEYS.userNotes,
    storage: "idb",
    version: 1,
    partialize: (s) => ({ byId: s.byId, order: s.order, noteAgentSessionById: s.noteAgentSessionById }),
    migrate: (persisted) => {
      const data = (persisted ?? {}) as {
        byId?: UserNotesState["byId"];
        order?: string[];
        noteAgentSessionById?: Record<string, string>;
      };
      return {
        byId: data.byId ?? {},
        order: data.order ?? [],
        noteAgentSessionById: data.noteAgentSessionById ?? {},
      };
    },
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      if (!state.noteAgentSessionById) state.noteAgentSessionById = {};
      stripUserNoteWindowState(state);
      state._setHasHydrated(true);
      state._setHydratedOwnerEpoch(getOwnerEpoch());
      state.ensureExampleNote();
    },
  },
);

// Keep lists/search results in sync with remote note merges and other store
// writers, while limiting body-only refreshes to a small cadence during typing.
let pendingLibraryRefresh: ReturnType<typeof setTimeout> | null = null;
let pendingLibraryOwnerEpoch: number | null = null;
let pendingLibraryOwner: string | null = null;

function cancelPendingLibraryRefresh(): void {
  if (pendingLibraryRefresh) clearTimeout(pendingLibraryRefresh);
  pendingLibraryRefresh = null;
  pendingLibraryOwnerEpoch = null;
  pendingLibraryOwner = null;
}

function scheduleLibraryRefresh(): void {
  const owner = getStorageOwner();
  const ownerEpoch = getOwnerEpoch();
  if (pendingLibraryRefresh) clearTimeout(pendingLibraryRefresh);
  pendingLibraryOwner = owner;
  pendingLibraryOwnerEpoch = ownerEpoch;
  pendingLibraryRefresh = setTimeout(() => {
    pendingLibraryRefresh = null;
    const scheduledOwner = pendingLibraryOwner;
    const scheduledEpoch = pendingLibraryOwnerEpoch;
    pendingLibraryOwner = null;
    pendingLibraryOwnerEpoch = null;
    if (getStorageOwner() !== scheduledOwner || getOwnerEpoch() !== scheduledEpoch) return;
    useUserNotes.setState((state) => ({ libraryRevision: state.libraryRevision + 1 }));
  }, NOTE_LIBRARY_REFRESH_MS);
}

useUserNotes.subscribe((state, previous) => {
  if (state.byId === previous.byId) return;
  if (state.libraryRevision !== previous.libraryRevision) {
    // A title/subject/create/delete change has already invalidated the list.
    // Cancel any pending body-only refresh so it cannot cause a duplicate pass.
    cancelPendingLibraryRefresh();
    return;
  }
  // One trailing timer coalesces local typing and also indexes remote merges.
  scheduleLibraryRefresh();
});

onStorageOwnerChange(() => cancelPendingLibraryRefresh());
