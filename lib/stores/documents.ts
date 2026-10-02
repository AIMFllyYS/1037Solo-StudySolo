import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { createPersistedStore } from "@/lib/stores/_persist";
import type { DocumentSpec, DocumentSection, StoredDocument, DocumentStatus } from "@/lib/documents/types";
import { assembleDocumentMarkdown } from "@/lib/documents/types";
import { scheduleCloudTombstone, scheduleCloudUpsert } from "@/lib/sync/schedule";
import { stripViewerId } from "@/lib/stores/windowPersist";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { readOwnedStorageItem, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { registerResourceMetrics } from "@/lib/performance/resourceMetrics";

const bodyLeases = new Map<string, number>();
let residentOwner: string | null = null;
onStorageOwnerChange(() => { bodyLeases.clear(); residentOwner = null; });
function bodyKey(id: string) { return `document-body:${id}`; }
function coldDocument(doc: StoredDocument): StoredDocument {
  return doc.bodyRef ? { ...doc, sections: doc.sections.map((section) => ({ ...section, markdown: undefined })) } : doc;
}

export async function loadDocumentFull(id: string): Promise<StoredDocument | null> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const doc = useDocuments.getState().byId[id];
  if (!doc) return null;
  if (!owner || residentOwner !== owner) throw new Error("document_owner_not_ready");
  if (!doc.bodyRef || doc.sections.some((section) => section.markdown)) return doc;
  const raw = await readOwnedStorageItem(owner, bodyKey(id));
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error("document_owner_changed");
  if (!raw) throw new Error("document_body_missing");
  try {
    const sections = JSON.parse(raw) as DocumentSection[];
    if (!Array.isArray(sections)) throw new Error("document_body_invalid");
    return { ...doc, sections };
  } catch { throw new Error("document_body_invalid"); }
}

export async function persistDocumentBody(doc: StoredDocument): Promise<boolean> {
  const owner = getStorageOwner();
  const saved = owner ? await writeOwnedStorageItem(owner, bodyKey(doc.id), JSON.stringify(doc.sections)) : false;
  if (saved && owner === getStorageOwner()) residentOwner = owner;
  return saved;
}

export async function hydrateDocumentBody(id: string): Promise<boolean> {
  if (!bodyLeases.has(id) && useDocuments.getState().viewerId !== id) return false;
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const full = await loadDocumentFull(id).catch(() => null);
  if (!full || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return false;
  useDocuments.setState((state) => {
    const current = state.byId[id];
    if (!current?.bodyRef || current.sections.some((section) => section.markdown)) return state;
    return { byId: { ...state.byId, [id]: { ...current, sections: full.sections } } };
  });
  return true;
}

export function acquireDocumentBodyLease(id: string) {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  bodyLeases.set(id, (bodyLeases.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const count = (bodyLeases.get(id) ?? 1) - 1;
    if (count > 0) { bodyLeases.set(id, count); return; }
    bodyLeases.delete(id);
    useDocuments.setState((state) => {
      const doc = state.byId[id];
      return doc?.bodyRef ? { byId: { ...state.byId, [id]: coldDocument(doc) } } : state;
    });
  };
}

async function persistAndCool(id: string): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const snapshot = useDocuments.getState().byId[id];
  if (!snapshot || !await persistDocumentBody(snapshot)) return;
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
  useDocuments.setState((state) => {
    const current = state.byId[id];
    if (!current || current.sections !== snapshot.sections) return state;
    const saved = { ...current, bodyRef: true as const };
    return { byId: { ...state.byId, [id]: bodyLeases.has(id) || state.viewerId === id ? saved : coldDocument(saved) } };
  });
}

async function migrateLegacyBodies(): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner) return;
  const upgrades = new Map<string, DocumentSection[]>();
  for (const doc of Object.values(useDocuments.getState().byId)) {
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    if (doc.bodyRef || !doc.sections.some((section) => section.markdown)) continue;
    if (await writeOwnedStorageItem(owner, bodyKey(doc.id), JSON.stringify(doc.sections))) upgrades.set(doc.id, doc.sections);
  }
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch || !upgrades.size) return;
  useDocuments.setState((state) => {
    const byId = { ...state.byId };
    for (const [id, sections] of upgrades) {
      const doc = byId[id];
      if (!doc || doc.sections !== sections) continue;
      const saved = { ...doc, bodyRef: true as const };
      byId[id] = bodyLeases.has(id) ? saved : coldDocument(saved);
    }
    return { byId };
  });
}

interface DocumentsState {
  byId: Record<string, StoredDocument>;
  viewerId: string | null;
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;

  create: (id: string, spec: DocumentSpec, modelId?: string) => void;
  setSections: (id: string, sections: DocumentSection[]) => void;
  setSectionMarkdown: (id: string, index: number, markdown: string) => void;
  setSectionStatus: (id: string, index: number, status: DocumentSection["status"], error?: string) => void;
  appendSection: (id: string, section: DocumentSection) => void;
  setStatus: (id: string, status: DocumentStatus, error?: string) => void;
  openViewer: (id: string, title?: string) => void;
  closeViewer: () => void;
  prune: (keepIds: string[]) => void;
}

function documentWindowId(id: string) {
  return `document-viewer:${id}`;
}

function documentWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 24, y: 64 }, size: { width: 860, height: 720 } };
  }
  const width = Math.min(900, Math.floor(window.innerWidth * 0.75));
  const height = Math.floor(window.innerHeight * 0.92);
  return {
    pos: { x: Math.max(16, Math.floor(window.innerWidth * 0.02)), y: Math.max(16, Math.floor(window.innerHeight * 0.03)) },
    size: { width, height },
  };
}

export const useDocuments = createPersistedStore<DocumentsState>(
    (set) => ({
      byId: {},
      viewerId: null,
      _hasHydrated: false,
      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      create: (id, spec, modelId) => {
        residentOwner = getStorageOwner();
        set((s) => {
          scheduleCloudUpsert("document", id);
          return {
            byId: {
              ...s.byId,
              [id]: {
                id,
                spec,
                modelId,
                sections: spec.outline?.map((title) => ({ title, status: "pending" })) ?? [],
                status: "idle",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setSections: (id, sections) =>
        set((s) => {
          const doc = s.byId[id];
          if (!doc) return s;
          scheduleCloudUpsert("document", id);
          return { byId: { ...s.byId, [id]: { ...doc, sections, bodyRef: undefined, updatedAt: Date.now() } } };
        }),

      setSectionMarkdown: (id, index, markdown) =>
        set((s) => {
          const doc = s.byId[id];
          if (!doc) return s;
          const sections = doc.sections.map((sec, i) => (i === index ? { ...sec, markdown } : sec));
          return { byId: { ...s.byId, [id]: { ...doc, sections, bodyRef: undefined, updatedAt: Date.now() } } };
        }),

      setSectionStatus: (id, index, status, error) =>
        set((s) => {
          const doc = s.byId[id];
          if (!doc) return s;
          const sections = doc.sections.map((sec, i) => (i === index ? { ...sec, status, error } : sec));
          return { byId: { ...s.byId, [id]: { ...doc, sections, bodyRef: undefined, updatedAt: Date.now() } } };
        }),

      appendSection: (id, section) =>
        set((s) => {
          const doc = s.byId[id];
          if (!doc) return s;
          return { byId: { ...s.byId, [id]: { ...doc, sections: [...doc.sections, section], bodyRef: undefined, updatedAt: Date.now() } } };
        }),

      setStatus: (id, status, error) => {
        set((s) => {
          const doc = s.byId[id];
          if (!doc) return s;
          scheduleCloudUpsert("document", id);
          return { byId: { ...s.byId, [id]: { ...doc, status, error, bodyRef: undefined, updatedAt: Date.now() } } };
        });
        if (status === "done" || status === "error") void persistAndCool(id);
      },

      /**
       * 打开（或复用）文档浮窗。与演示同一口径：**文档还没落盘也要开窗**——
       * Agent 面里卡片是 silent 的，参考列点进来时它可能还在分节撰写，
       * 以前 `if (!doc) return s` 会让这一下点击毫无反应（同 artifacts.openViewer 的老毛病）。
       */
      openViewer: (id, title) =>
        set((s) => {
          const doc = s.byId[id];
          const windowId = documentWindowId(id);
          const wm = useWindowManager.getState();
          const existing = wm.windows.find((win) => win.id === windowId);
          const nextTitle = doc?.spec.title || title || windowId;
          if (existing) {
            wm.updateWindow(windowId, { title: nextTitle });
            if (existing.minimized) wm.restoreWindow(windowId);
            else wm.bringToFront(windowId);
          } else {
            const { pos, size } = documentWindowGeometry();
            wm.openWindow({
              id: windowId,
              type: "document-viewer",
              title: nextTitle,
              pos,
              size,
              data: { documentId: id },
            });
          }
          return { viewerId: id };
        }),

      closeViewer: () =>
        set((s) => {
          if (s.viewerId) useWindowManager.getState().closeWindow(documentWindowId(s.viewerId));
          if (!s.viewerId) return { viewerId: null };
          const doc = s.byId[s.viewerId];
          return { viewerId: null, byId: doc?.bodyRef && !bodyLeases.has(s.viewerId) ? { ...s.byId, [s.viewerId]: coldDocument(doc) } : s.byId };
        }),

      prune: (keepIds) =>
        set((s) => {
          const keepSet = new Set(keepIds);
          const byId: Record<string, StoredDocument> = {};
          for (const id of keepSet) if (s.byId[id]) byId[id] = s.byId[id];
          for (const id of Object.keys(s.byId)) {
            if (!keepSet.has(id)) scheduleCloudTombstone("document", id);
          }
          return { byId };
        }),
    }),
    {
      name: PERSIST_KEYS.documents,
      storage: "idb",
      partialize: (s) => ({ byId: Object.fromEntries(Object.entries(s.byId).map(([id, doc]) => [id, coldDocument(doc)])) }),
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
registerResourceMetrics(() => ({ documentBodyEstimatedBytes: Object.values(useDocuments.getState().byId).reduce((sum, doc) => sum + doc.sections.reduce((total, section) => total + (section.markdown?.length ?? 0) * 2, 0), 0) }));

export function getDocumentMarkdown(id: string): string | null {
  const doc = useDocuments.getState().byId[id];
  return doc ? assembleDocumentMarkdown(doc) : null;
}
