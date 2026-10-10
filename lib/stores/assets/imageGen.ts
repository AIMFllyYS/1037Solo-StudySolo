import { setSyncItemStatus } from '@/lib/sync/status';
import { translateNow } from "@/lib/i18n/index";
import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { createPersistedStore } from "@/lib/stores/_persist";
import { stripOpenIds } from "@/lib/stores/workspace/windowPersist";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { readOwnedStorageItem, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { registerResourceMetrics } from "@/lib/performance/resourceMetrics";
import {scheduleCloudUpsert,scheduleCloudTombstone} from '@/lib/sync/schedule';

export type ImageGenStatus = "idle" | "loading" | "done" | "error";

export interface ImageGenImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenSession {
  cloudRevision?:number;
  id: string;
  prompt: string;
  title: string;
  size: string;
  count: number;
  modelId?: string;
  status: ImageGenStatus;
  images: ImageGenImage[];
  error?: string;
  createdAt: number;
  /** 本轮生成开始时刻（进度条估算用）；完成 / 失败后保留最近一次。 */
  startedAt?: number;
  /** 该模型声明的典型耗时（毫秒），由开跑时按模型写入。 */
  expectedMs?: number;
  /**
   * 「已获用户批准，开窗即开跑」。
   *
   * 生图是**付费**动作，批准只能由用户点对话里的「批准」按钮给出（ImageGenCard.onApprove）。
   * 右上参考列只是另一个入口，它建会话时 autoStart 保持 false —— 图窗会先亮出提示词与
   * 「开始生成」按钮，绝不因为"打开看了一眼"就扣费。
   */
  autoStart?: boolean;
  /** Generated image payloads live in a separate owner-scoped IDB row. */
  bodyRef?: true;
}

const imageLeases = new Map<string, number>();
let residentOwner: string | null = null;
onStorageOwnerChange(() => { imageLeases.clear(); residentOwner = null; });
function bodyKey(id: string) { return `image-gen-body:${id}`; }
function coldSession(session: ImageGenSession): ImageGenSession { return session.bodyRef ? { ...session, images: [] } : session; }

export async function loadImageGenSessionFull(id: string): Promise<ImageGenSession | null> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner || residentOwner !== owner) return null;
  const session = useImageGen.getState().sessions[id];
  if (!session) return null;
  if(session.cloudRevision!==undefined){const {hydrateRemotePayload}=await import('@/lib/assets/client');const full=await hydrateRemotePayload('image-gen',id,session.cloudRevision) as ImageGenSession;if(owner!==getStorageOwner()||epoch!==getOwnerEpoch()||useImageGen.getState().sessions[id]!==session)throw new Error('正文加载期间状态已变化，请重试。');if(!await writeOwnedStorageItem(owner,bodyKey(id),JSON.stringify(full.images)))throw new Error('图像缓存保存失败。');if(owner!==getStorageOwner()||epoch!==getOwnerEpoch()||useImageGen.getState().sessions[id]!==session)throw new Error('正文加载期间状态已变化，请重试。');useImageGen.setState(state=>state.sessions[id]===session?{sessions:{...state.sessions,[id]:{...session,cloudRevision:undefined}}}:state);return {...full,bodyRef:true};}
  if (!session.bodyRef || session.images.length) return session;
  const raw = await readOwnedStorageItem(owner, bodyKey(id));
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch || !raw) return null;
  try {
    const images = JSON.parse(raw) as ImageGenImage[];
    return Array.isArray(images) ? { ...session, images } : null;
  } catch { return null; }
}

export async function hydrateImageGenImages(id: string): Promise<boolean> {
  if (!imageLeases.has(id) && !useImageGen.getState().openIds.includes(id)) return false;
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const full = await loadImageGenSessionFull(id);
  if (!full || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return false;
  useImageGen.setState((state) => {
    const current = state.sessions[id];
    if (!current?.bodyRef || current.images.length) return state;
    return { sessions: { ...state.sessions, [id]: { ...current, images: full.images } } };
  });
  return true;
}

export function acquireImageGenLease(id: string) {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  imageLeases.set(id, (imageLeases.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const count = (imageLeases.get(id) ?? 1) - 1;
    if (count > 0) { imageLeases.set(id, count); return; }
    imageLeases.delete(id);
    useImageGen.setState((state) => {
      const row = state.sessions[id];
      return row?.bodyRef && row.images.length ? { sessions: { ...state.sessions, [id]: coldSession(row) } } : state;
    });
  };
}

async function persistAndCool(id: string): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const snapshot = useImageGen.getState().sessions[id];
  if (!owner || !snapshot?.images.length) return;
  const saved = await writeOwnedStorageItem(owner, bodyKey(id), JSON.stringify(snapshot.images));
  if (!saved || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
  useImageGen.setState((state) => {
    const current = state.sessions[id];
    if (!current || current.images !== snapshot.images) return state;
    const row = { ...current, bodyRef: true as const };
    if(current.status==='done')scheduleCloudUpsert('image-gen',id);
    return { sessions: { ...state.sessions, [id]: imageLeases.has(id) || state.openIds.includes(id) ? row : coldSession(row) } };
  });
}
export async function applyCloudImageSession(row:ImageGenSession){
 const owner=getStorageOwner(),epoch=getOwnerEpoch();if(!owner)return;
 if(!await writeOwnedStorageItem(owner,bodyKey(row.id),JSON.stringify(row.images)))throw new Error('图像正文落盘失败。');
 if(owner!==getStorageOwner()||epoch!==getOwnerEpoch())throw new Error('账号已切换。');residentOwner=owner;
 useImageGen.setState(state=>({sessions:{...state.sessions,[row.id]:{...row,bodyRef:true,images:[]}}}));
}

async function migrateLegacyImages(): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner) return;
  const upgraded = new Map<string, ImageGenImage[]>();
  for (const row of Object.values(useImageGen.getState().sessions)) {
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    if (row.bodyRef || !row.images.length) continue;
    if (await writeOwnedStorageItem(owner, bodyKey(row.id), JSON.stringify(row.images))) upgraded.set(row.id, row.images);
  }
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch || !upgraded.size) return;
  useImageGen.setState((state) => {
    const sessions = { ...state.sessions };
    for (const [id, images] of upgraded) {
      const row = sessions[id];
      if (!row || row.images !== images) continue;
      const saved = { ...row, bodyRef: true as const };
      sessions[id] = imageLeases.has(id) ? saved : coldSession(saved);
    }
    return { sessions };
  });
}

export interface ImageGenSessionInit {
  id: string;
  prompt: string;
  title: string;
  size?: string;
  count?: number;
  modelId?: string;
}

interface ImageGenState {
  openIds: string[];
  sessions: Record<string, ImageGenSession>;
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;

  /**
   * 打开（或复用）生图窗。
   *
   * @param options.approve 用户已点过「批准」：新会话直接标 autoStart，图窗开出来就开跑。
   *   缺省（参考列等旁路入口）不标，图窗先停下来等用户在图窗里再点一次「开始生成」。
   */
  openViewer: (init: ImageGenSessionInit, options?: { approve?: boolean }) => void;
  closeViewer: (id: string) => void;
  bringToFront: (id: string) => void;
  updateSession: (id: string, patch: Partial<ImageGenSession>) => void;
  /** expectedMs = 该模型声明的典型耗时，只用于前端进度估算。 */
  startLoading: (id: string, expectedMs?: number) => void;
  removeSession: (id: string) => void;
}

function imageGenWindowId(id: string) {
  return `image-gen-viewer:${id}`;
}

function imageGenWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 60, y: 80 }, size: { width: 720, height: 720 } };
  }
  const width = Math.min(720, Math.floor(window.innerWidth * 0.6));
  const height = Math.min(820, Math.floor(window.innerHeight * 0.88));
  const openCount = useImageGen.getState().openIds.length;
  const offset = openCount * 24;
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.16) + offset),
      y: Math.max(16, Math.floor(window.innerHeight * 0.04) + offset),
    },
    size: { width, height },
  };
}

export const useImageGen = createPersistedStore<ImageGenState>(
    (set, get) => ({
      openIds: [],
      sessions: {},
      _hasHydrated: false,
      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      openViewer: (init, options) => {
        residentOwner = getStorageOwner();
        const id = init.id;
        const existing = get().sessions[id];
        const isAlreadyOpen = get().openIds.includes(id);
        const approve = options?.approve ?? false;

        const session: ImageGenSession = existing
          ? (approve && !existing.autoStart ? { ...existing, autoStart: true } : existing)
          : {
              id,
              prompt: init.prompt,
              // 对话里的生图卡也是这个兜底标题（ImageGenCard → window.imageGen.card.defaultTitle）。
              title: init.title || translateNow("window.imageGen.card.defaultTitle"),
              size: init.size || "1024x1024",
              count: init.count || 1,
              modelId: init.modelId,
              status: "idle",
              images: [],
              createdAt: Date.now(),
              autoStart: approve,
            };

        const { pos, size } = imageGenWindowGeometry();
        useWindowManager.getState().openWindow({
          id: imageGenWindowId(id),
          type: "image-gen-viewer",
          title: session.title,
          pos,
          size,
          data: { imageGenId: id },
        });

        set((state) => ({
          openIds: isAlreadyOpen ? state.openIds : [...state.openIds, id],
          sessions: { ...state.sessions, [id]: session },
        }));
      },

      closeViewer: (id) => {
        useWindowManager.getState().closeWindow(imageGenWindowId(id));
        set((state) => ({
          openIds: state.openIds.filter((oid) => oid !== id),
          sessions: state.sessions[id]?.bodyRef && !imageLeases.has(id)
            ? { ...state.sessions, [id]: coldSession(state.sessions[id]) }
            : state.sessions,
        }));
      },

      bringToFront: (id) => {
        const winMgr = useWindowManager.getState();
        const win = winMgr.windows.find((w) => w.id === imageGenWindowId(id));

        if (!win) {
          const session = get().sessions[id];
          if (!session) return;
          const { pos, size } = imageGenWindowGeometry();
          winMgr.openWindow({
            id: imageGenWindowId(id),
            type: "image-gen-viewer",
            title: session.title,
            pos,
            size,
            data: { imageGenId: id },
          });
        } else if (win.minimized) {
          winMgr.restoreWindow(imageGenWindowId(id));
        } else {
          winMgr.bringToFront(imageGenWindowId(id));
        }

        set((state) => ({
          openIds: state.openIds.includes(id) ? state.openIds : [...state.openIds, id],
        }));
      },

      startLoading: (id, expectedMs) =>
        set((state) => {
          setSyncItemStatus(`image-gen:${id}`,{phase:'pending'});
          const cur = state.sessions[id];
          if (!cur) return state;
          return {
            sessions: {
              ...state.sessions,
              [id]: {
                ...cur,
                status: "loading",
                error: undefined,
                // 每次开跑都重置起点：重试时进度要从头走，而不是接着上一轮。
                startedAt: Date.now(),
                ...(expectedMs && expectedMs > 0 ? { expectedMs } : {}),
              },
            },
          };
        }),

      updateSession: (id, patch) => {
        set((state) => {
          const cur = state.sessions[id];
          if (!cur) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...cur, ...patch, ...(patch.images ? { bodyRef: undefined, cloudRevision: undefined } : {}) } },
          };
        });
        if (patch.images?.length||patch.status==='done') void persistAndCool(id);
      },

      removeSession: (id) =>
        set((state) => {
          scheduleCloudTombstone('image-gen',id);
          const next = { ...state.sessions };
          delete next[id];
          useWindowManager.getState().closeWindow(imageGenWindowId(id));
          return {
            sessions: next,
            openIds: state.openIds.filter((oid) => oid !== id),
          };
        }),
    }),
    {
      name: PERSIST_KEYS.imageGen,
      storage: "idb",
      partialize: (s) => ({ sessions: Object.fromEntries(Object.entries(s.sessions).map(([id, row]) => [id, coldSession(row)])) }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          stripOpenIds(state);
          // リロードやプロセス再起動で死んだ fetch の残骸として "loading" が残ると、
          // 再オープン時に永久スピナーになる。中断エラーへ矯正してリトライ可能にする。
          for (const session of Object.values(state.sessions)) {
            if (session.status === "loading") {
              session.status = "error";
              session.error = translateNow("window.imageGen.interrupted");
            }
          }
        }
        const owner = getStorageOwner(), epoch = getOwnerEpoch();
        void migrateLegacyImages().finally(() => {
          if (owner === getStorageOwner() && epoch === getOwnerEpoch()) {
            residentOwner = owner;
            state?._setHasHydrated(true);
          }
        });
      },
    },
);
registerResourceMetrics(() => ({ imageGenBodyEstimatedBytes: Object.values(useImageGen.getState().sessions).reduce((sum, session) => sum + session.images.reduce((total, image) => total + (image.b64_json?.length ?? 0) * 2, 0), 0) }));

export { imageGenWindowId };
