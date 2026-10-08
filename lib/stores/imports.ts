import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { createPersistedStore } from "@/lib/stores/_persist";

/**
 * Agent 的本地导入记录：「我的资产 → 文件 / 网址」两栏的数据源。
 *
 * 口径（用户确认）：**只存路径与元数据，不存文件内容，不上云** —— 相当于一条快捷方式。
 * 绝对路径只有 Electron 下拿得到（webUtils.getPathForFile）；浏览器里留空，UI 会自动隐藏「用系统打开」。
 */

export type ImportKind = "file" | "url";

export type ImportSource = "composer" | "window-taskbar" | "browser" | "project-files" | "assets";

export interface ImportRecord {
  localFileId?: string;
  desktopFileId?: string;
  sourceVersion?: string;
  sessionId?: string | null;
  cloudFileId?: string;
  id: string;
  kind: ImportKind;
  name: string;
  /** 本机绝对路径（仅 Electron）。 */
  absPath?: string;
  url?: string;
  title?: string;
  faviconUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  /** 从「项目文件」导入时带上，资产页据此显示归属。 */
  projectId?: string;
  source: ImportSource;
  createdAt: number;
  updatedAt: number;
}

export interface RecordImportInput {
  id?: string;
  localFileId?: string;
  desktopFileId?: string;
  sourceVersion?: string;
  sessionId?: string | null;
  cloudFileId?: string;
  kind: ImportKind;
  name: string;
  absPath?: string;
  url?: string;
  title?: string;
  faviconUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  projectId?: string;
  source: ImportSource;
}

interface ImportsState {
  order: string[];
  byId: Record<string, ImportRecord>;
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;
  /** 记一条导入；同一个路径/网址只更新不重复追加。返回记录 id。 */
  record: (input: RecordImportInput) => string | null;
  remove: (id: string) => void;
  clear: () => void;
}

/** 去重键：文件按绝对路径，网址按 URL；都没有就按名字。 */
function dedupeKey(input: Pick<RecordImportInput, "kind" | "name" | "absPath" | "url">): string {
  const locator = input.kind === "url" ? input.url : (input.absPath ?? input.name);
  return `${input.kind}:${locator ?? input.name}`;
}

function genId(): string {
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useImports = createPersistedStore<ImportsState>(
  (set, get) => ({
    order: [],
    byId: {},
    _hasHydrated: false,
    _setHasHydrated: (v) => set({ _hasHydrated: v }),

    record: (input) => {
      const name = input.name.trim();
      if (!name) return null;
      const now = Date.now();
      const key = dedupeKey({ ...input, name });
      const existing = input.id ? get().byId[input.id] : Object.values(get().byId).find(
        (item) => dedupeKey(item) === key,
      );
      if (existing) {
        set((state) => ({
          byId: {
            ...state.byId,
            [existing.id]: {
              ...existing,
              localFileId: input.localFileId ?? existing.localFileId,
              desktopFileId: input.desktopFileId ?? existing.desktopFileId,
              sourceVersion: input.sourceVersion ?? existing.sourceVersion,
              sessionId: input.sessionId ?? existing.sessionId,
              name,
              absPath: input.absPath ?? existing.absPath,
              url: input.url ?? existing.url,
              title: input.title ?? existing.title,
              faviconUrl: input.faviconUrl ?? existing.faviconUrl,
              sizeBytes: input.sizeBytes ?? existing.sizeBytes,
              mimeType: input.mimeType ?? existing.mimeType,
              projectId: input.projectId ?? existing.projectId,
              cloudFileId: input.cloudFileId ?? existing.cloudFileId,
              source: input.source,
              updatedAt: now,
            },
          },
        }));
        return existing.id;
      }
      const id = input.id ?? genId();
      const record: ImportRecord = {
        localFileId: input.localFileId,
        desktopFileId: input.desktopFileId,
        sourceVersion: input.sourceVersion,
        sessionId: input.sessionId,
        id,
        kind: input.kind,
        name,
        absPath: input.absPath,
        url: input.url,
        title: input.title,
        faviconUrl: input.faviconUrl,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        projectId: input.projectId,
        cloudFileId: input.cloudFileId,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => ({
        byId: { ...state.byId, [id]: record },
        order: [...state.order, id],
      }));
      return id;
    },

    remove: (id) =>
      set((state) => {
        if (!state.byId[id]) return state;
        const byId = { ...state.byId };
        delete byId[id];
        return { byId, order: state.order.filter((item) => item !== id) };
      }),

    clear: () => set({ byId: {}, order: [] }),
  }),
  {
    name: PERSIST_KEYS.imports,
    storage: "idb",
    partialize: (s) => ({ byId: s.byId, order: s.order }),
    onRehydrateStorage: () => (state) => {
      state?._setHasHydrated(true);
    },
  },
);

/** 便于非 React 调用点记录导入（输入框附件、加号菜单、项目文件窗）。 */
export function recordImport(input: RecordImportInput): string | null {
  return useImports.getState().record(input);
}

/**
 * 取本机绝对路径：Electron 走 preload 暴露的 desktop.getPathForFile（Electron ≥ 32 的官方姿势），
 * 旧版 Chromium 还有非标准的 file.path。浏览器里拿不到——那就返回 undefined，UI 会自动隐藏「用系统打开」。
 */
export function localPathOf(file: File): string | undefined {
  const desktop = (globalThis as { desktop?: { getPathForFile?: (target: File) => string } }).desktop;
  if (desktop?.getPathForFile) {
    try {
      return desktop.getPathForFile(file) || undefined;
    } catch {
      /* ignore */
    }
  }
  const legacy = (file as File & { path?: unknown }).path;
  return typeof legacy === "string" && legacy ? legacy : undefined;
}
