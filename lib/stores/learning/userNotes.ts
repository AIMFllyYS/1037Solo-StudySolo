import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { createPersistedStore } from "@/lib/stores/_persist";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { BLANK_NOTE_MARKDOWN, deriveNoteTitle, EXAMPLE_USER_NOTE_ID, isClassroomNote, seedExampleNoteIfEmpty, USER_NOTE_LIBRARY_WINDOW_ID, userNoteWindowId, type NoteLibraryIntent, type UserNote, type UserNoteKind } from "@/lib/notes/userNote";
import { notifyUserNoteChanged } from "@/lib/notes/userNoteSync";
import { carryUserNoteSearchFields } from "@/lib/notes/userNoteSearch";
import { stripUserNoteWindowState } from "@/lib/stores/workspace/windowPersist";
import { useToast } from "@/lib/stores/toast";
import type { UserNotesState } from "./userNotes/types";
import { reviewSelectionNoteGeometry, stickyNoteGeometry, editorWindowGeometry, libraryTitle, libraryWindowGeometry } from "./userNotes/windows";
export type { UserNotePatch, CreateUserNoteInit, OpenEditorOptions, OpenNoteLibraryOptions } from "./userNotes/types";
export { selectUserNotes, selectLibraryNotes, selectClassroomNotes } from "./userNotes/selectors";
// 个人笔记仓库（IndexedDB 持久化，复用 useReviewCards / useDocuments 范式）。
// 本机 IndexedDB 为真相源。云同步走 notifyUserNoteChanged（SYNC POINT），
// 不在本文件扩展 CLOUD_SYNC_KINDS / 额度统计。
//
// 窗口态（openEditorIds / library*）不持久化：窗口管理器本身也不持久化，
// 刷新后重开窗口比恢复一堆空壳窗口更符合预期。

const genId = () => Math.random().toString(36).slice(2, 11);
const NOTE_LIBRARY_REFRESH_MS = 500;

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