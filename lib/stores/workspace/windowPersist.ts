/**
 * 刷新后的窗口态：IndexedDB 里旧包可能仍带着 openEditorIds / viewerId / openIds。
 * 窗口管理器本身不持久化，这些字段水合后必须丢掉，否则会自动弹出历史窗。
 */

export const EMPTY_USER_NOTE_WINDOW_STATE = {
  openEditorIds: [] as string[],
  dirtyEditorIds: [] as string[],
  libraryOpen: false,
  agentEditingNoteId: null as string | null,
  noteAgentOpenIds: [] as string[],
};

export function stripUserNoteWindowState<T extends Partial<typeof EMPTY_USER_NOTE_WINDOW_STATE>>(
  state: T,
): T {
  state.openEditorIds = [];
  state.dirtyEditorIds = [];
  state.libraryOpen = false;
  state.agentEditingNoteId = null;
  state.noteAgentOpenIds = [];
  return state;
}

export function stripViewerId<T extends { viewerId?: string | null }>(state: T): T {
  state.viewerId = null;
  return state;
}

export function stripOpenIds<T extends { openIds?: string[] }>(state: T): T {
  state.openIds = [];
  return state;
}
