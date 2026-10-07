import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { createPersistedStore } from "@/lib/stores/_persist";
import { onStorageOwnerChange } from '@/lib/storage/ownerScope';
import { getStorageOwner } from '@/lib/storage/ownerScope';
import { subscribeCloudFileChanges } from '@/lib/files/events';
import type { SliceTextResult } from "@/lib/project/slice";
import type { ProjectFileEntry, ProjectFileStatus, ProjectStudioRef } from "@/lib/project/types";

/**
 * 项目文件的本机索引缓存（IndexedDB）。原文件与处理结果由云端保存，cloudFileId 用于重建缓存。
 *
 * 写入路径固定三步：beginImport（占位 + parsing）→ finishImport / failImport。
 * 解析在 lib/project/parse.ts 里做，store 只负责状态与去重，不碰 File/Blob。
 */

function genId(): string {
  return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 同一个项目里同名（同路径优先）的文件只保留一条：重新导入 = 覆盖更新。 */
function findExisting(
  entries: ProjectFileEntry[],
  input: { projectId: string; name: string; absPath?: string },
): ProjectFileEntry | undefined {
  return entries.find(
    (entry) =>
      entry.projectId === input.projectId &&
      (input.absPath && entry.absPath === input.absPath ? true : entry.name === input.name),
  );
}

interface ProjectFilesState {
  order: string[];
  byId: Record<string, ProjectFileEntry>;
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;

  /** 占位一条「正在解析」的文件，返回条目 id。同名同路径会复用旧条目（重新解析）。 */
  beginImport: (input: {
    projectId: string;
    name: string;
    absPath?: string;
    mimeType?: string;
    sizeBytes?: number;
    mtime?: number;
  }) => string;
  finishImport: (id: string, result: SliceTextResult) => void;
  failImport: (id: string, message: string) => void;
  /** 引用 Studio 教材（软链接：只有 path，正文由 getSection 读）。 */
  addStudioRef: (input: { projectId: string; ref: ProjectStudioRef }) => string;
  setPinned: (fileId: string, sliceId: string, pinned: boolean) => void;
  removeFile: (id: string) => void;
  clearProject: (projectId: string) => void;
}

export const useProjectFiles = createPersistedStore<ProjectFilesState>(
  (set, get) => ({
    order: [],
    byId: {},
    _hasHydrated: false,
    _setHasHydrated: (v) => set({ _hasHydrated: v }),

    beginImport: (input) => {
      const now = Date.now();
      const existing = findExisting(Object.values(get().byId), input);
      const id = existing?.id ?? genId();
      const entry: ProjectFileEntry = {
        id,
        projectId: input.projectId,
        kind: "imported",
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        mtime: input.mtime,
        absPath: input.absPath,
        status: "parsing",
        error: undefined,
        // 重新解析时先把旧索引清掉：宁可短暂为空，也不让旧内容被当成新内容。
        indexMarkdown: existing ? "" : "",
        charCount: 0,
        slices: [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      set((state) => ({
        byId: { ...state.byId, [id]: entry },
        order: state.order.includes(id) ? state.order : [...state.order, id],
      }));
      return id;
    },

    finishImport: (id, result) =>
      set((state) => {
        const prev = state.byId[id];
        if (!prev) return state;
        return {
          byId: {
            ...state.byId,
            [id]: {
              ...prev,
              status: "indexed" as ProjectFileStatus,
              error: undefined,
              indexMarkdown: result.indexMarkdown,
              charCount: result.charCount,
              slices: result.slices,
              updatedAt: Date.now(),
            },
          },
        };
      }),

    failImport: (id, message) =>
      set((state) => {
        const prev = state.byId[id];
        if (!prev) return state;
        return {
          byId: {
            ...state.byId,
            [id]: { ...prev, status: "error", error: message, slices: [], indexMarkdown: "", updatedAt: Date.now() },
          },
        };
      }),

    addStudioRef: ({ projectId, ref }) => {
      const now = Date.now();
      const existing = Object.values(get().byId).find(
        (entry) => entry.projectId === projectId && entry.studioRef?.path === ref.path,
      );
      const id = existing?.id ?? genId();
      const entry: ProjectFileEntry = {
        id,
        projectId,
        kind: "studio-ref",
        name: ref.title || ref.path,
        studioRef: ref,
        status: "indexed",
        indexMarkdown: `# ${ref.title} · 教材引用\n\n- 路径：\`${ref.path}\`\n- 出处：${ref.address}\n\n> 软链接：正文由 Agent 用 getSection(path) 直接读 Studio 内容，不复制到本机。`,
        charCount: 0,
        slices: [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      set((state) => ({
        byId: { ...state.byId, [id]: entry },
        order: state.order.includes(id) ? state.order : [...state.order, id],
      }));
      return id;
    },

    setPinned: (fileId, sliceId, pinned) =>
      set((state) => {
        const entry = state.byId[fileId];
        if (!entry) return state;
        return {
          byId: {
            ...state.byId,
            [fileId]: {
              ...entry,
              slices: entry.slices.map((slice) =>
                slice.id === sliceId ? { ...slice, pinned } : slice,
              ),
            },
          },
        };
      }),

    removeFile: (id) =>
      set((state) => {
        if (!state.byId[id]) return state;
        const byId = { ...state.byId };
        delete byId[id];
        return { byId, order: state.order.filter((item) => item !== id) };
      }),

    clearProject: (projectId) =>
      set((state) => {
        const drop = new Set(
          Object.values(state.byId)
            .filter((entry) => entry.projectId === projectId)
            .map((entry) => entry.id),
        );
        if (drop.size === 0) return state;
        const byId: Record<string, ProjectFileEntry> = {};
        for (const [id, entry] of Object.entries(state.byId)) {
          if (!drop.has(id)) byId[id] = entry;
        }
        return { byId, order: state.order.filter((id) => !drop.has(id)) };
      }),
  }),
  {
    name: PERSIST_KEYS.projectFiles,
    storage: "idb",
    partialize: (s) => ({ byId: s.byId, order: s.order }),
    onRehydrateStorage: () => (state) => {
      // 上次没解析完的文件重启后不能假装还在跑：标成 error，用户点重新解析即可。
      if (state) {
        for (const id of state.order) {
          const entry = state.byId[id];
          if (entry && entry.status === "parsing") {
            state.byId[id] = { ...entry, status: "error", error: "上次解析未完成" };
          }
        }
      }
      state?._setHasHydrated(true);
    },
  },
);

onStorageOwnerChange(() => {
  // Clear resident data without writing an empty snapshot over the next owner's cache.
  const storage = useProjectFiles.persist.getOptions().storage;
  if (storage) useProjectFiles.persist.setOptions({ storage: { ...storage, setItem: () => {} } });
  useProjectFiles.setState({ order: [], byId: {}, _hasHydrated: false });
  if (storage) useProjectFiles.persist.setOptions({ storage });
});
subscribeCloudFileChanges(change => {
  if (change.owner !== getStorageOwner() || change.action !== 'delete') return;
  for (const entry of Object.values(useProjectFiles.getState().byId)) if (entry.cloudFileId === change.id) useProjectFiles.getState().removeFile(entry.id);
});

/** 项目内的文件（按导入顺序）。 */
export function listProjectFiles(
  state: Pick<ProjectFilesState, "order" | "byId">,
  projectId: string,
): ProjectFileEntry[] {
  return state.order.map((id) => state.byId[id]).filter((entry): entry is ProjectFileEntry => Boolean(entry) && entry!.projectId === projectId);
}
