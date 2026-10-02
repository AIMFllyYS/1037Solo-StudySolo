import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { createPersistedStore } from "@/lib/stores/_persist";
import { scheduleCloudTombstone, scheduleCloudUpsert } from "@/lib/sync/schedule";
import { stripViewerId } from "@/lib/stores/windowPersist";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { readOwnedStorageItem, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { htmlToSummary } from "@/lib/context/compactArtifacts";
import { registerResourceMetrics } from "@/lib/performance/resourceMetrics";

/**
 * HTML 演示（Artifact）store。链路：tools.ts renderInteractive → ArtifactCard → 本 store → ArtifactViewer。
 * viewerId 只表示「哪个演示浮窗开着」，浮窗由 AppShell 挂载，不是笔记区组件。
 */

/** AI 生成的交互式 HTML 产物（IndexedDB 持久化）。 */
export interface Artifact {
  id: string;
  title: string;
  html: string;
  status: "done";
  /** 生成时的思考过程，刷新后仍要能展开查看。 */
  reasoning?: string;
  /** Body is durably stored under an owner-scoped per-artifact key. */
  bodyRef?: true;
  summary?: string;
}

const bodyLeases = new Map<string, number>();
let residentOwner: string | null = null;
onStorageOwnerChange(() => { bodyLeases.clear(); residentOwner = null; });
function bodyKey(id: string) { return `artifact-body:${id}`; }
function coldArtifact(artifact: Artifact): Artifact { return artifact.bodyRef ? { ...artifact, html: "" } : artifact; }

export async function loadArtifactFull(id: string): Promise<Artifact | null> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const artifact = useArtifacts.getState().byId[id];
  if (!artifact) return null;
  if (!owner || residentOwner !== owner) throw new Error("artifact_owner_not_ready");
  if (artifact.html || !artifact.bodyRef) return artifact;
  const html = await readOwnedStorageItem(owner, bodyKey(id));
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error("artifact_owner_changed");
  if (html === null) throw new Error("artifact_body_missing");
  return { ...artifact, html };
}

export async function persistArtifactBody(artifact: Artifact): Promise<boolean> {
  const owner = getStorageOwner();
  const saved = owner ? await writeOwnedStorageItem(owner, bodyKey(artifact.id), artifact.html) : false;
  if (saved && owner === getStorageOwner()) residentOwner = owner;
  return saved;
}

export async function hydrateArtifactBody(id: string): Promise<boolean> {
  if (!bodyLeases.has(id) && useArtifacts.getState().viewerId !== id) return false;
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const full = await loadArtifactFull(id).catch(() => null);
  if (!full || !full.html || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return false;
  useArtifacts.setState((state) => {
    const current = state.byId[id];
    if (!current || current.html) return state;
    return { byId: { ...state.byId, [id]: { ...current, html: full.html } } };
  });
  return true;
}

export function acquireArtifactBodyLease(id: string) {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  bodyLeases.set(id, (bodyLeases.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const remaining = (bodyLeases.get(id) ?? 1) - 1;
    if (remaining > 0) { bodyLeases.set(id, remaining); return; }
    bodyLeases.delete(id);
    useArtifacts.setState((state) => {
      const row = state.byId[id];
      return row?.bodyRef && row.html ? { byId: { ...state.byId, [id]: coldArtifact(row) } } : state;
    });
  };
}

async function migrateLegacyBodies(): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner) return;
  const upgraded = new Map<string, string>();
  for (const row of Object.values(useArtifacts.getState().byId)) {
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    if (row.bodyRef || !row.html) continue;
    if (await writeOwnedStorageItem(owner, bodyKey(row.id), row.html)) upgraded.set(row.id, row.html);
  }
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch || !upgraded.size) return;
  useArtifacts.setState((state) => {
    const byId = { ...state.byId };
    for (const [id, html] of upgraded) {
      const row = byId[id];
      if (!row || row.html !== html) continue;
      byId[id] = { ...row, bodyRef: true, summary: row.summary ?? htmlToSummary(html), html: bodyLeases.has(id) ? html : "" };
    }
    return { byId };
  });
}

interface ArtifactsState {
  order: string[];
  byId: Record<string, Artifact>;
  /** 当前在弹窗中查看的产物 id；null 表示未打开。 */
  viewerId: string | null;
  /** IndexedDB 异步水合完成标志。 */
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;

  saveDone: (id: string, title: string, html: string, reasoning?: string) => void;
  openViewer: (id: string, title?: string) => void;
  closeViewer: () => void;
  /** 删除不在 keepIds 中的 artifact，用于跨 store 孤儿清理。 */
  prune: (keepIds: string[]) => void;
}

function artifactWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 24, y: 64 }, size: { width: 860, height: 720 } };
  }
  const width = Math.min(860, Math.floor(window.innerWidth * 0.72));
  const height = Math.floor(window.innerHeight * 0.94);
  return {
    pos: { x: Math.max(16, Math.floor(window.innerWidth * 0.02)), y: Math.max(16, Math.floor(window.innerHeight * 0.03)) },
    size: { width, height },
  };
}

function artifactWindowId(id: string) {
  return `artifact-viewer:${id}`;
}

export const useArtifacts = createPersistedStore<ArtifactsState>(
    (set) => ({
      order: [],
      byId: {},
      viewerId: null,
      _hasHydrated: false,
      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      saveDone: (id, title, html, reasoning) => {
        residentOwner = getStorageOwner();
        set((s) => {
          const exists = s.byId[id];
          const order = exists ? s.order : [...s.order, id];
          const prev = s.byId[id];
          scheduleCloudUpsert("artifact", id);
          return {
            order,
            byId: {
              ...s.byId,
              [id]: {
                id,
                title,
                html,
                status: "done",
                reasoning: reasoning || prev?.reasoning || "",
                summary: htmlToSummary(html),
                bodyRef: undefined,
              },
            },
          };
        });
        const owner = getStorageOwner(), epoch = getOwnerEpoch();
        if (owner) void writeOwnedStorageItem(owner, bodyKey(id), html).then((saved) => {
          if (!saved || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
          useArtifacts.setState((state) => {
            const row = state.byId[id];
            if (!row || row.html !== html) return state;
            return { byId: { ...state.byId, [id]: { ...row, bodyRef: true, html: bodyLeases.has(id) || state.viewerId === id ? html : "" } } };
          });
        });
      },

      /**
       * 打开（或复用）演示浮窗。
       *
       * **产物还没落盘也要开窗**：Agent 面里卡片是 silent 的（中间栏不画），生成中就能从右上
       * 参考列点进来——以前这里 `if (artifact)` 才开窗，于是生成中/生成失败时点一下毫无反应
       * （用户口径「不好使」）。现在窗口先开出来，ArtifactViewer 自己渲染「生成中 / 数据缺失」态。
       * `title` 供产物尚未落盘时给窗口一个像样的标题（调用方通常拿的是产物标题）。
       */
      openViewer: (id, title) =>
        set((state) => {
          const artifact = state.byId[id];
          const windowId = artifactWindowId(id);
          const wm = useWindowManager.getState();
          const existing = wm.windows.find((win) => win.id === windowId);
          const nextTitle = artifact?.title || title || windowId;
          if (existing) {
            wm.updateWindow(windowId, { title: nextTitle });
            if (existing.minimized) wm.restoreWindow(windowId);
            else wm.bringToFront(windowId);
          } else {
            const { pos, size } = artifactWindowGeometry();
            wm.openWindow({
              id: windowId,
              type: "artifact-viewer",
              title: nextTitle,
              pos,
              size,
              data: { artifactId: id },
            });
          }
          return { viewerId: id };
        }),
      closeViewer: () =>
        set((state) => {
          if (state.viewerId) useWindowManager.getState().closeWindow(artifactWindowId(state.viewerId));
          return { viewerId: null };
        }),

      prune: (keepIds) =>
        set((s) => {
          const keepSet = new Set(keepIds);
          const newById: Record<string, Artifact> = {};
          const newOrder: string[] = [];
          for (const id of s.order) {
            if (keepSet.has(id)) {
              newById[id] = s.byId[id];
              newOrder.push(id);
            } else {
              scheduleCloudTombstone("artifact", id);
            }
          }
          for (const id of Object.keys(s.byId)) {
            if (!keepSet.has(id) && !s.order.includes(id)) scheduleCloudTombstone("artifact", id);
          }
          return { byId: newById, order: newOrder };
        }),
    }),
    {
      name: PERSIST_KEYS.artifacts,
      storage: "idb",
      partialize: (s) => ({ order: s.order, byId: Object.fromEntries(Object.entries(s.byId).map(([id, row]) => [id, coldArtifact(row)])) }),
      onRehydrateStorage: () => (state) => {
        if (state) stripViewerId(state);
        const owner = getStorageOwner(), epoch = getOwnerEpoch();
        void migrateLegacyBodies().finally(() => {
          if (owner === getStorageOwner() && epoch === getOwnerEpoch()) {
            residentOwner = owner;
            state?._setHasHydrated(true);
          }
        });
      },
    },
);
registerResourceMetrics(() => ({ artifactBodyEstimatedBytes: Object.values(useArtifacts.getState().byId).reduce((sum, row) => sum + row.html.length * 2, 0) }));
