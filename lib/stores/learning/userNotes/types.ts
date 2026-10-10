import { type ClassroomNoteSource, type NoteLibraryIntent, type UserNote, type UserNoteKind } from "@/lib/notes/userNote";

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

export interface UserNotesState {
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