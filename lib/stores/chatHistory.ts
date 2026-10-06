import { create } from 'zustand';
import type { ChatMessage, ChatContext } from '@/lib/types/chat';
import { useArtifacts } from '@/lib/hooks/useArtifacts';
import {
  type ChatFolder,
  type ChatManifestV2,
  type SessionMeta,
  type SessionWindowLoad,
  manifestFrom,
  ensureDefaultProjects as ensureDefaultProjectRows,
  isSystemProject,
  mergeArtifactIds,
  loadManifest,
  saveManifest,
  loadSessionWindow,
  loadTurnsBefore,
  appendSessionMessages,
  writeSessionMessage,
  dropSessionTailCache,
  hasSessionWriteLease,
  saveSessionMessages,
  migrateFromV1IfNeeded,
  deleteSessionData,
  listBlobIdsForSession,
  persistInlineAttachments,
  scheduleOrphanChatGc,
} from '@/lib/storage/chatStorage';
import {
  tailWindowSlice,
  turnCountsOf,
  EARLIER_TURNS_BATCH,
  TURNS_PER_CHUNK,
  type TurnSpineEntry,
} from '@/lib/chat/turnSpine';
import { getMessageText } from '@/lib/chat/messageParts';
import { mergeRememberedSlices } from '@/lib/project/sessionSlices';
import { scheduleCloudTombstone, scheduleCloudUpsert } from '@/lib/sync/schedule';
import { useSessionRuns } from '@/lib/stores/sessionRuns';
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';
import {DEFAULT_RESOURCE_BUDGETS} from '@/lib/performance/budgets';
import {getOwnerEpoch,getStorageOwner,onStorageOwnerChange} from '@/lib/storage/ownerScope';

type LeaseReason='visible'|'stream'|'write'|'explicit-pin'
const sessionLeases=new Map<string,Map<LeaseReason,number>>()
const legacyPins=new Map<string,number>()
const residentEstimates=new Map<string,{messages:ChatMessage[];bytes:number}>()
let pinnedPressureBytes=0
export function getHotSessionPressureBytes(){return pinnedPressureBytes}
export function acquireSessionLease(sessionId:string,reason:LeaseReason){
  const reasons=sessionLeases.get(sessionId)??new Map<LeaseReason,number>()
  reasons.set(reason,(reasons.get(reason)??0)+1);sessionLeases.set(sessionId,reasons)
  let released=false
  return {sessionId,reason,release(){if(released)return;released=true;const current=sessionLeases.get(sessionId);if(!current)return;const count=(current.get(reason)??1)-1;if(count>0)current.set(reason,count);else current.delete(reason);if(!current.size)sessionLeases.delete(sessionId);useChatHistory.setState(state=>applySessionWindow(state,state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState))}}
}
export function enforceHotSessionBudget(){useChatHistory.setState(state=>applySessionWindow(state,state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState))}

function estimateHotValueBytes(value:unknown):number{
  if(typeof value==='string')return value.length*2
  if(typeof value==='number'||typeof value==='boolean')return 8
  if(!value||typeof value!=='object')return 0
  if(ArrayBuffer.isView(value))return value.byteLength+32
  if(value instanceof ArrayBuffer)return value.byteLength+32
  if(typeof Blob!=='undefined'&&value instanceof Blob)return value.size+32
  if(Array.isArray(value))return 24+value.reduce((sum:number,item:unknown)=>sum+estimateHotValueBytes(item),0)
  return 32+Object.entries(value).reduce((sum,[key,item])=>sum+key.length*2+estimateHotValueBytes(item),0)
}
function estimateResident(id:string,messages:ChatMessage[]){
  const found=residentEstimates.get(id)
  if(found?.messages===messages)return found.bytes
  const bytes=estimateHotValueBytes(messages)
  residentEstimates.set(id,{messages,bytes})
  return bytes
}
function updateResidentEstimate(id:string,before:ChatMessage[],after:ChatMessage[],oldMessage?:ChatMessage,newMessage?:ChatMessage){
  const previous=estimateResident(id,before)
  const bytes=oldMessage&&newMessage?Math.max(0,previous+estimateHotValueBytes(newMessage)-estimateHotValueBytes(oldMessage)):estimateHotValueBytes(after)
  residentEstimates.set(id,{messages:after,bytes})
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  context?: ChatContext;
  kind?: 'main' | 'floating' | 'note' | 'scheduled';
  /** Storage v2：历史列表在未加载消息体时使用 */
  messageCount?: number;
}

/** 已加载窗口的描述：messagesById[id] 保存的是轮次区间 [startTurn, turnCount) 的消息。 */
export interface SessionWindowMeta {
  startTurn: number;
  /** 窗口首条消息在全量数组里的下标。 */
  startIndex: number;
  turnCount: number;
  messageCount: number;
  spine: TurnSpineEntry[];
}

interface ChatHistoryState {
  sessionsMeta: SessionMeta[];
  /** 对话项目（与 sessionsMeta 一起写进 manifest）；含两个系统项目。 */
  folders: ChatFolder[];
  /** 下一次「新建对话」的落点项目；null = 不使用项目。 */
  activeProjectId: string | null;
  messagesById: Record<string, ChatMessage[]>;
  /**
   * 每条已加载会话的窗口边界 + 全量 spine。
   * spine 是不读消息正文也能拿到的轮次索引（定位点 / 派生计数 / 「还有更早」全靠它）；
   * 缺省的条目（老测试、sync 直写的内存态）按「全量已加载、没有更早」处理。
   */
  sessionWindowById: Record<string, SessionWindowMeta | undefined>;
  activeSessionId: string | null;
  sessionLoadState: Record<string, 'idle' | 'loading' | 'loaded' | 'error'>;
  loadedSessionIds: string[];
  pinnedSessionIds: string[];
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;
  /** 当前 active 会话消息已从 IDB 加载完成 */
  _activeMessagesReady: boolean;
  _setActiveMessagesReady: (v: boolean) => void;
  /** 合并 meta + 已加载 messages，供历史面板等使用 */
  getSessions: () => ChatSession[];
  pinSession: (id: string) => void;
  unpinSession: (id: string) => void;
  ensureSessionLoaded: (sessionId: string) => Promise<void>;
  /** 「加载更早」：把窗口上界往前推 count 轮，返回实际prepend的轮数。 */
  loadEarlierTurns: (sessionId: string, count?: number) => Promise<number>;
  /** 定位点回跳：把窗口上界推到目标轮（含），返回该轮在 messagesById 里的新下标。 */
  jumpToTurn: (sessionId: string, turn: number) => Promise<number | null>;
  /** 全量物化（分享 / 导出 / 来源面板等用户主动「看全部」动作走这里）。 */
  ensureSessionFullyLoaded: (sessionId: string) => Promise<void>;
  /** 补齐两个系统项目（幂等）。水合前不落盘。 */
  ensureDefaultProjects: () => void;
  /** 选择/清空下一次新建对话的落点项目。 */
  setActiveProject: (projectId: string | null) => void;
  /** 新建会话；folderId 落到某个项目（系统项目的成员由 kind 决定，不从这条路径传）。 */
  createSession: (context?: ChatContext, kind?: 'main' | 'floating' | 'note' | 'scheduled', folderId?: string | null) => string;
  /**
   * 显式「新建对话」：左栏按钮 / 右键菜单 / 快捷键 / 面板头部都走这里，规则只有一份。
   * 已经站在一条空白新对话里就什么都不做；否则**复用**最新那条空白 main 会话；都没有才真的新建。
   * 防的是连点重复创建空白会话。历史 metadata 不设删除上限；热内存由 applySessionWindow 控制。
   * 未水合时返回 null 并等水合完再做（绝不基于空列表落盘）。
   */
  startNewChat: (context?: ChatContext, projectId?: string | null) => string | null;
  /** 「点了新建、复用了已有空白对话」的累计次数：只给 UI 一次轻反馈用，不落盘。 */
  blankChatPulse: number;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  replaceMessages: (sessionId: string, messages: ChatMessage[], baseMessages?: ChatMessage[]) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  /** 归档 / 取消归档；归档不删除消息，只是从默认列表移出。 */
  archiveSession: (sessionId: string, archived: boolean) => void;
  /** 新建项目；两个系统项目由 ensureDefaultProjects 种下，不走这里。 */
  createFolder: (name?: string, opts?: { system?: ChatFolder['system'] }) => string;
  /** 重命名项目（系统项目也可以改显示名），并把新名字同步到云端。 */
  renameFolder: (folderId: string, name: string) => void;
  /** 删除项目；系统项目不可删（返回 false），成员会话退回 Recents。 */
  deleteFolder: (folderId: string) => boolean;
  moveSessionToFolder: (sessionId: string, folderId: string | null) => void;
  /** 记录本会话读过的项目切片（去重 + 上限截断）；没有新 id 时不落盘。 */
  rememberReadSlices: (sessionId: string, sliceIds: string[]) => void;
}

let bootstrapPromise: Promise<void> | null = null;

function metaToChatSession(meta: SessionMeta, messages: ChatMessage[]): ChatSession {
  return {
    id: meta.id,
    title: meta.title,
    messages,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    context: meta.context,
    kind: meta.kind,
    messageCount: meta.messageCount,
  };
}

/**
 * manifest 全量落盘（唯一入口）。
 *
 * **未水合前一律不写**：那时 sessionsMeta 还是空数组，写下去等于把盘上真实的会话列表
 * 覆盖成「只剩刚建的那一条」；紧接着启动期的孤儿 GC 会以 manifest 为唯一真相源，
 * 把其余会话的消息体全部当成孤儿删掉——2026-09-19 的真实数据事故就是这个链路。
 * 未水合期间照常改内存，但绝不允许落盘。
 */
function persistManifest(state: ChatHistoryState, manifest: ChatManifestV2): void {
  if (!state._hasHydrated) return;
  saveManifest(manifest);
}

/**
 * 从当前状态出发构造 manifest，只覆盖显式传入的字段。
 * **不允许手写 manifest 字面量**：2026-09-19 的会话清空事故与之后的「云端拉取丢 projects」
 * 都是漏字段造成的，多一个入口就多一次漏的机会。
 */
function manifestOf(
  state: Pick<ChatHistoryState, 'activeSessionId' | 'sessionsMeta' | 'folders' | 'activeProjectId'>,
  overrides: Partial<Pick<ChatManifestV2, 'activeSessionId' | 'sessions' | 'folders' | 'activeProjectId'>> = {},
): ChatManifestV2 {
  return manifestFrom(state, overrides);
}

/**
 * 「空白新对话」：main 类型、没归档、一条消息都没有。
 * 用 meta.messageCount 判定（写在 manifest 里），不依赖消息体是否已从 IndexedDB 加载回来，
 * 否则一个正在加载的真实对话会被误判成空白。
 */
function isBlankMainSession(meta: SessionMeta): boolean {
  // 'scheduled' 会话不算空白新对话：startNewChat 复用空白的语义是「用户自己还没输入」，
  // 把一条待触发/中断的调度会话回收成普通新对话会让运行记录与内容脱节。
  return meta.kind !== 'floating' && meta.kind !== 'note' && meta.kind !== 'scheduled' && !meta.archived && meta.messageCount === 0;
}

function pruneArtifactsFromMetas(metas: SessionMeta[]): void {
  const keepIds = metas.flatMap((m) => m.artifactIds);
  try {
    useArtifacts.getState().prune(keepIds);
  } catch {
    // ignore
  }
}

function applySessionWindow(
  state:ChatHistoryState,
  messages:Record<string,ChatMessage[]>,
  windows:Record<string,SessionWindowMeta|undefined>,
  lru:string[],
  loadState:ChatHistoryState['sessionLoadState'],
  protectId?:string,
):Pick<ChatHistoryState,'messagesById'|'sessionWindowById'|'loadedSessionIds'|'sessionLoadState'>{
  const messagesById={...messages},sessionWindowById={...windows},sessionLoadState={...loadState}
  const keys=Object.keys(messagesById),keySet=new Set(keys)
  const order=[...lru.filter(id=>keySet.has(id)),...keys.filter(id=>!lru.includes(id))]
  const protectedIds=new Set([state.activeSessionId,protectId,...state.pinnedSessionIds].filter(Boolean) as string[])
  for(const id of keys)if(sessionLeases.has(id)||useSessionRuns.getState().byId[id]?.phase==='running'||hasSessionWriteLease(id))protectedIds.add(id)
  let totalBytes=keys.reduce((sum,id)=>sum+estimateResident(id,messagesById[id]),0)
  let inactive=keys.filter(id=>!protectedIds.has(id)).length
  for(const id of order){
    if(inactive<=DEFAULT_RESOURCE_BUDGETS.inactiveHotSessions&&totalBytes<=DEFAULT_RESOURCE_BUDGETS.hotMessageEstimatedBytes)break
    if(protectedIds.has(id))continue
    totalBytes-=residentEstimates.get(id)?.bytes??0;inactive--
    delete messagesById[id];delete sessionWindowById[id];residentEstimates.delete(id)
    sessionLoadState[id]='idle';dropSessionTailCache(id)
  }
  for(const id of Object.keys(sessionWindowById))if(!messagesById[id])delete sessionWindowById[id]
  for(const id of residentEstimates.keys())if(!messagesById[id])residentEstimates.delete(id)
  pinnedPressureBytes=Math.max(0,totalBytes-DEFAULT_RESOURCE_BUDGETS.hotMessageEstimatedBytes)
  return {messagesById,sessionWindowById,loadedSessionIds:order.filter(id=>messagesById[id]!==undefined),sessionLoadState}
}

function windowMetaFromLoad(load: SessionWindowLoad): SessionWindowMeta {
  return {
    startTurn: load.startTurn,
    startIndex: load.startIndex,
    turnCount: load.turnCount,
    messageCount: load.messageCount,
    spine: load.spine,
  };
}

const EMPTY_WINDOW: SessionWindowMeta = { startTurn: 0, startIndex: 0, turnCount: 0, messageCount: 0, spine: [] };

/**
 * 追加消息时同步维护内存 spine（与存储层 buildChunkSpine 同一套规则：
 * user 消息开新轮，其余并入上一轮）。定位点 / 「还有更早」 / 派生计数立刻可见新轮，
 * 不必等下一次窗口加载。
 */
function runtimeSpineAppend(spine: TurnSpineEntry[], message: ChatMessage, globalIndex: number): TurnSpineEntry[] {
  const last = spine[spine.length - 1];
  if (message.role === 'user' || !last) {
    const turn = last ? last.turn + 1 : 0;
    const isUser = message.role === 'user';
    return [
      ...spine,
      {
        turn,
        chunk: Math.floor(turn / TURNS_PER_CHUNK),
        firstIndex: globalIndex,
        messageCount: 1,
        firstMessageId: message.id,
        userMessageId: isUser ? message.id : null,
        preview: isUser ? getMessageText(message).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
        counts: turnCountsOf([message]),
      },
    ];
  }
  const add = turnCountsOf([message]);
  const next = spine.slice();
  next[next.length - 1] = {
    ...last,
    messageCount: last.messageCount + 1,
    counts: {
      sources: last.counts.sources + add.sources,
      images: last.counts.images + add.images,
      products: last.counts.products + add.products,
    },
  };
  return next;
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export const useChatHistory = create<ChatHistoryState>()((set, get) => ({
  sessionsMeta: [],
  folders: [],
  activeProjectId: null,
  messagesById: {},
  sessionWindowById: {},
  activeSessionId: null,
  sessionLoadState: {},
  loadedSessionIds: [],
  pinnedSessionIds: [],
  _hasHydrated: false,
  _activeMessagesReady: false,
  blankChatPulse: 0,
  _setHasHydrated: (v) => set({ _hasHydrated: v }),
  _setActiveMessagesReady: (v) => set({ _activeMessagesReady: v }),

  getSessions: () => {
    const { sessionsMeta, messagesById } = get();
    return sessionsMeta.map((meta) =>
      metaToChatSession(meta, messagesById[meta.id] ?? []),
    );
  },

  pinSession: (id) => {
    legacyPins.set(id,(legacyPins.get(id)??0)+1)
    set((state) => ({
      pinnedSessionIds: state.pinnedSessionIds.includes(id)
        ? state.pinnedSessionIds
        : [...state.pinnedSessionIds, id],
    }));
  },

  unpinSession: (id) => {
    const remaining=Math.max(0,(legacyPins.get(id)??1)-1)
    if(remaining){legacyPins.set(id,remaining);return}
    legacyPins.delete(id)
    set((state) => {
      const pinnedSessionIds=state.pinnedSessionIds.filter(x=>x!==id)
      return {pinnedSessionIds,...applySessionWindow({...state,pinnedSessionIds},state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState)}
    });
  },

  ensureSessionLoaded: async (sessionId) => {
    const ownerId=getStorageOwner(),epoch=getOwnerEpoch();if(!ownerId)return;
    const current=()=>getStorageOwner()===ownerId&&getOwnerEpoch()===epoch;
    const state = get();
    if (state.messagesById[sessionId]) {
      set((s) => ({
        sessionLoadState: { ...s.sessionLoadState, [sessionId]: 'loaded' },
      }));
      return;
    }
    set((s) => ({
      sessionLoadState: { ...s.sessionLoadState, [sessionId]: 'loading' },
    }));
    // 窗口读：只取最近若干轮 + 全量 spine；更早的轮次留在 chunk 里按需回读。
    const window = await loadSessionWindow(sessionId);
    if(!current())return;
    if (!window) {
      set((s) => ({
        sessionLoadState: { ...s.sessionLoadState, [sessionId]: 'error' },
      }));
      return;
    }
    set((s) => {
      if(!current()||!s.sessionsMeta.some(meta=>meta.id===sessionId))return s;
      const messagesById = { ...s.messagesById, [sessionId]: window.messages };
      const sessionWindowById = { ...s.sessionWindowById, [sessionId]: windowMetaFromLoad(window) };
      const loadedSessionIds = [...s.loadedSessionIds.filter((x) => x !== sessionId), sessionId];
      return applySessionWindow(s,messagesById,sessionWindowById,loadedSessionIds,{...s.sessionLoadState,[sessionId]:'loaded'})
    });
  },

  loadEarlierTurns: async (sessionId, count = EARLIER_TURNS_BATCH) => {
    const ownerId=getStorageOwner(),epoch=getOwnerEpoch();if(!ownerId)return 0;
    const window = get().sessionWindowById[sessionId];
    const loaded = get().messagesById[sessionId];
    if (!window || !loaded || window.startTurn <= 0) return 0;
    const range = await loadTurnsBefore(sessionId, window.startTurn, count);
    if(getStorageOwner()!==ownerId||getOwnerEpoch()!==epoch)return 0;
    if (!range || range.fromTurn >= window.startTurn) return 0;
    set((state) => {
      if(getStorageOwner()!==ownerId||getOwnerEpoch()!==epoch)return state;
      const current = state.sessionWindowById[sessionId];
      const existing = state.messagesById[sessionId];
      if (!current || !existing) return state;
      // 重复调用/并发时按 id 去重：轮次区间本不该重叠，但 stream 落尾可能让边界相交。
      const seen = new Set(existing.map((message) => message.id));
      const prepend = range.messages.filter((message) => !seen.has(message.id));
      return applySessionWindow(state,{...state.messagesById,[sessionId]:[...prepend,...existing]},{...state.sessionWindowById,[sessionId]:{...current,startTurn:range.fromTurn,startIndex:range.startIndex}},state.loadedSessionIds,state.sessionLoadState,sessionId)
    });
    return window.startTurn - range.fromTurn;
  },

  jumpToTurn: async (sessionId, turn) => {
    const window = get().sessionWindowById[sessionId];
    if (!window || turn < 0 || turn >= window.turnCount) return null;
    if (turn >= window.startTurn) {
      const entry = window.spine[turn];
      return entry ? entry.firstIndex - window.startIndex : null;
    }
    const loaded = await get().loadEarlierTurns(sessionId, window.startTurn - turn);
    if (loaded <= 0) return null;
    const next = get().sessionWindowById[sessionId];
    const entry = next?.spine[turn];
    return next && entry ? entry.firstIndex - next.startIndex : null;
  },

  ensureSessionFullyLoaded: async (sessionId) => {
    const ownerId=getStorageOwner(),epoch=getOwnerEpoch();if(!ownerId)return;
    const window = get().sessionWindowById[sessionId];
    if (window && window.startTurn === 0 && get().messagesById[sessionId]) return;
    // tailTurns=Infinity：窗口起点拉到 0，等于全量装配。
    const full = await loadSessionWindow(sessionId, Number.MAX_SAFE_INTEGER);
    if (!full||getStorageOwner()!==ownerId||getOwnerEpoch()!==epoch) return;
    set((state) => getStorageOwner()!==ownerId||getOwnerEpoch()!==epoch?state:applySessionWindow(state,{...state.messagesById,[sessionId]:full.messages},{...state.sessionWindowById,[sessionId]:windowMetaFromLoad(full)},[...state.loadedSessionIds.filter(id=>id!==sessionId),sessionId],{...state.sessionLoadState,[sessionId]:'loaded'},sessionId));
  },

  createSession: (context, kind, folderId) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    // scheduled 会话也不抢占 active：定时任务在后台跑，不能把用户正在聊的对话顶掉。
    const claimActive = kind !== 'floating' && kind !== 'note' && kind !== 'scheduled';
    const meta: SessionMeta = {
      id,
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      kind: claimActive ? undefined : kind,
      context,
      messageCount: 0,
      artifactIds: [],
      // 系统项目的成员由 kind 决定（笔记记录 / 划词摘录），只有普通会话才落 folderId。
      ...(claimActive && folderId ? { folderId } : {}),
    };
    set((state) => {
      const sessionsMeta = [meta, ...state.sessionsMeta];
      const messagesById = { ...state.messagesById, [id]: [] };
      const sessionWindowById = { ...state.sessionWindowById, [id]: { ...EMPTY_WINDOW } };
      persistManifest(
        state,
        manifestOf(state, { activeSessionId: claimActive ? id : state.activeSessionId, sessions: sessionsMeta }),
      );
      residentEstimates.delete(id)
      const nextActive=claimActive?id:state.activeSessionId
      const resident=applySessionWindow({...state,activeSessionId:nextActive},messagesById,sessionWindowById,[...state.loadedSessionIds.filter(x=>x!==id),id],{...state.sessionLoadState,[id]:'loaded'},id)
      return {
        sessionsMeta,
        ...resident,
        activeSessionId:nextActive,
        _activeMessagesReady: claimActive ? true : state._activeMessagesReady,
      };
    });
    saveSessionMessages(id, []);
    scheduleCloudUpsert('chat-session', id);
    return id;
  },

  startNewChat: (context, projectId) => {
    const state = get();
    const ownerId=getStorageOwner(),epoch=getOwnerEpoch();
    const targetProjectId = projectId === undefined ? state.activeProjectId : projectId;
    // 还没水合：此刻的 sessionsMeta 是空数组，任何「新建」都会把盘上的真实列表覆盖掉。
    // 等水合完再按当时的真实列表决定，期间返回 null（调用方都不依赖返回值）。
    if (!state._hasHydrated) {
      void ensureChatHistoryBootstrap()
        .then(() => {
          if(getStorageOwner()===ownerId&&getOwnerEpoch()===epoch)get().startNewChat(context, projectId);
        })
        .catch(() => {
          // 水合失败就什么都不做：宁可这次点击没反应，也不能基于空列表落盘
        });
      return null;
    }
    // 先看「脚下这条」：已经站在一条空白新对话里就原地不动
    // （草稿、输入框实例都原样保留），只放一个脉冲让 UI 提示一下。
    const active = state.sessionsMeta.find((meta) => meta.id === state.activeSessionId);
    if (active && isBlankMainSession(active)) {
      set({ blankChatPulse: state.blankChatPulse + 1 });
      useSessionRuns.getState().markViewed(active.id);
      return active.id;
    }
    // 否则复用列表里最近的一条空白新对话（sessionsMeta 新的在前）。
    const blank = state.sessionsMeta.find(isBlankMainSession);
    if (!blank) return get().createSession(context, undefined, targetProjectId);
    // 复用而不是新建。**不走 switchSession**：它会先从 IndexedDB 读一次消息体，
    // 而空白会话的消息体可能压根不在盘上，读空会让 loadState 变 'error'；
    // canSendNow 只认 'loaded'，于是发送被静默挡掉。
    // 复用一条已有空白对话时，也要把它挪到这次选的落点项目上（否则 chip 选了项目却没生效）。
    const nextFolderId = targetProjectId ?? null;
    const sessionsMeta =
      (blank.folderId ?? null) === nextFolderId
        ? state.sessionsMeta
        : state.sessionsMeta.map((meta) => (meta.id === blank.id ? { ...meta, folderId: nextFolderId } : meta));
    const resident=applySessionWindow({...state,activeSessionId:blank.id},state.messagesById[blank.id]
      ?state.messagesById:{...state.messagesById,[blank.id]:[]},state.sessionWindowById[blank.id]
      ?state.sessionWindowById:{...state.sessionWindowById,[blank.id]:{...EMPTY_WINDOW}},[...state.loadedSessionIds.filter(id=>id!==blank.id),blank.id],{...state.sessionLoadState,[blank.id]:'loaded'},blank.id)
    set({
      sessionsMeta,
      activeSessionId: blank.id,
      ...resident,
      _activeMessagesReady: true,
    });
    persistManifest(state, manifestOf(state, { activeSessionId: blank.id, sessions: sessionsMeta }));
    if (sessionsMeta !== state.sessionsMeta) scheduleCloudUpsert('chat-session', blank.id);
    useSessionRuns.getState().markViewed(blank.id);
    return blank.id;
  },

  deleteSession: (id) => {
    // 先停掉这条会话可能还在跑的运行（abort + 抹记录），再删数据。
    useSessionRuns.getState().remove(id);
    let nextActiveToLoad: string | null = null;
    set((state) => {
      const sessionsMeta = state.sessionsMeta.filter((s) => s.id !== id);
      const deletedActive = state.activeSessionId === id;
      const newActiveId =
        deletedActive
          ? sessionsMeta.length > 0
            ? sessionsMeta[0].id
            : null
          : state.activeSessionId;
      nextActiveToLoad = deletedActive ? newActiveId : null;
      const messagesById = { ...state.messagesById };
      delete messagesById[id];
      const sessionWindowById = { ...state.sessionWindowById };
      delete sessionWindowById[id];
      dropSessionTailCache(id);
      pruneArtifactsFromMetas(sessionsMeta);
      persistManifest(state, manifestOf(state, { activeSessionId: newActiveId, sessions: sessionsMeta }));
      const ownerId=getStorageOwner(),epoch=getOwnerEpoch();
      void (async () => {
        const blobIds = await listBlobIdsForSession(id);
        if(getStorageOwner()!==ownerId||getOwnerEpoch()!==epoch)return;
        await deleteSessionData(id, blobIds);
        scheduleOrphanChatGc();
      })();
      scheduleCloudTombstone('chat-session', id);
      residentEstimates.delete(id)
      const resident=applySessionWindow({...state,activeSessionId:newActiveId},messagesById,sessionWindowById,state.loadedSessionIds.filter(x=>x!==id),{...state.sessionLoadState,[id]:'idle'})
      return {
        sessionsMeta,
        ...resident,
        activeSessionId: newActiveId,
        _activeMessagesReady: deletedActive ? newActiveId === null : state._activeMessagesReady,
      };
    });
    if (nextActiveToLoad) {
      const ownerId=getStorageOwner(),epoch=getOwnerEpoch();
      // 删除后自动落到下一条会话 = 用户在看它，顺手消掉未读徽标。
      useSessionRuns.getState().markViewed(nextActiveToLoad);
      void get().ensureSessionLoaded(nextActiveToLoad).then(() => {
        if (getStorageOwner()===ownerId&&getOwnerEpoch()===epoch&&get().activeSessionId === nextActiveToLoad) {
          get()._setActiveMessagesReady(true);
        }
      });
    }
  },

  switchSession: (id) => {
    const ownerId=getStorageOwner(),epoch=getOwnerEpoch();
    set(state=>{
      persistManifest(state, manifestOf(state, { activeSessionId: id }));
      return {activeSessionId:id,_activeMessagesReady:false,...applySessionWindow({...state,activeSessionId:id},state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState,id)};
    });
    useSessionRuns.getState().markViewed(id);
    void get().ensureSessionLoaded(id).then(() => {
      if (getStorageOwner()===ownerId&&getOwnerEpoch()===epoch&&get().activeSessionId === id) {
        get()._setActiveMessagesReady(true);
      }
    });
  },

  addMessage: (sessionId, message) => {
    set((state) => {
      if (!state.sessionsMeta.some((s) => s.id === sessionId)) return state;
      const storedMessage = persistInlineAttachments(message);
      const prev = state.messagesById[sessionId] ?? [];
      const messages = [...prev, storedMessage];
      const prevWindow = state.sessionWindowById[sessionId];
      // 有窗口元信息才增量维护 spine/messageCount；没有的按旧语义只记数组。
      const nextWindow = prevWindow
        ? {
            ...prevWindow,
            messageCount: prevWindow.messageCount + 1,
            turnCount: 0, // 占位，下面 spine 推完再填
            spine: runtimeSpineAppend(prevWindow.spine, storedMessage, prevWindow.startIndex + prev.length),
          }
        : undefined;
      if (nextWindow) nextWindow.turnCount = nextWindow.spine.length;
      const fullCount = prevWindow ? prevWindow.messageCount + 1 : messages.length;
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messageCount: fullCount,
              preview: storedMessage.role === 'user' ? getMessageText(storedMessage).slice(0, 80) : s.preview,
              artifactIds: mergeArtifactIds(s.artifactIds, [storedMessage]),
            }
          : s,
      );
      // 持久化走增量追加（尾块重写），不是整段序列化。
      appendSessionMessages(sessionId, [storedMessage]);
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      scheduleCloudUpsert('chat-session', sessionId);
      const sessionWindowById = nextWindow
        ? { ...state.sessionWindowById, [sessionId]: nextWindow }
        : state.sessionWindowById;
      updateResidentEstimate(sessionId,prev,messages)
      return {
        ...applySessionWindow(state,{...state.messagesById,[sessionId]:messages},sessionWindowById,[...state.loadedSessionIds.filter(id=>id!==sessionId),sessionId],state.sessionLoadState,sessionId),
        sessionsMeta,
      };
    });
  },

  replaceMessages: (sessionId, messages, baseMessages) => {
    set((state) => {
      if (!state.sessionsMeta.some((s) => s.id === sessionId)) return state;
      const stored = messages.map((message) => persistInlineAttachments(message));
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messageCount: stored.length,
              preview: stored.find((item) => item.role === "user")
                ? getMessageText(stored.find((item) => item.role === "user")!).slice(0, 80)
                : s.preview,
              artifactIds: mergeArtifactIds([], stored),
            }
          : s,
      );
      saveSessionMessages(sessionId, stored, baseMessages);
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      scheduleCloudUpsert("chat-session", sessionId);
      // 整段替换后窗口重置为新的尾部窗口（compact / 云拉取都走这里）。
      const sliced = tailWindowSlice(stored);
      residentEstimates.set(sessionId,{messages:sliced.messages,bytes:estimateHotValueBytes(sliced.messages)})
      return {
        ...applySessionWindow(state,{...state.messagesById,[sessionId]:sliced.messages},{
          ...state.sessionWindowById,
          [sessionId]: {
            startTurn: sliced.startTurn,
            startIndex: sliced.startIndex,
            turnCount: sliced.spine.length,
            messageCount: stored.length,
            spine: sliced.spine,
          },
        },[...state.loadedSessionIds.filter(id=>id!==sessionId),sessionId],state.sessionLoadState,sessionId),
        sessionsMeta,
      };
    });
  },

  // 性能契约：仅替换目标 session / message；未修改 session 须保留引用（供 useChat 引用相等订阅）。
  updateMessage: (sessionId, messageId, updates) => {
    set((state) => {
      if (!state.sessionsMeta.some((s) => s.id === sessionId)) return state;
      const prev = state.messagesById[sessionId];
      if (!prev) return state;
      const target = prev.find((m) => m.id === messageId);
      if (!target) return state;
      const updated = { ...target, ...updates };
      const messages = prev.map((m) => (m.id === messageId ? updated : m));
      // 流式期每 tick 都会走这里：只在 artifactIds 真变化时才新建 meta/数组——
      // 否则 sessionsMeta 每 tick 都是新引用，侧栏/历史层/项目 chip 全量重渲。
      let shouldSaveManifest = false;
      let sessionsMeta = state.sessionsMeta;
      const metaIndex = state.sessionsMeta.findIndex((s) => s.id === sessionId);
      if (metaIndex >= 0) {
        const meta = state.sessionsMeta[metaIndex];
        const artifactIds = mergeArtifactIds(meta.artifactIds, [updated]);
        if (!sameStringArray(meta.artifactIds, artifactIds)) {
          sessionsMeta = state.sessionsMeta.slice();
          sessionsMeta[metaIndex] = { ...meta, updatedAt: Date.now(), artifactIds };
          shouldSaveManifest = true;
        }
      }
      // 持久化只重写目标消息所在的那一个 chunk（流式期恒定命中尾块）。
      writeSessionMessage(sessionId, updated);
      if (shouldSaveManifest) {
        persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      }
      // 流式吐出的工具结果会改变所在轮的派生计数：按轮重算（只扫本轮几条消息）。
      let sessionWindowById = state.sessionWindowById;
      const window = sessionWindowById[sessionId];
      if (window) {
        const globalIndex = window.startIndex + prev.findIndex((m) => m.id === messageId);
        const entry = window.spine.find(
          (s) => globalIndex >= s.firstIndex && globalIndex < s.firstIndex + s.messageCount,
        );
        if (entry) {
          const turnStart = entry.firstIndex - window.startIndex;
          const counts = turnCountsOf(messages.slice(turnStart, turnStart + entry.messageCount));
          const spine = window.spine.map((s) => (s === entry ? { ...s, counts } : s));
          sessionWindowById = { ...sessionWindowById, [sessionId]: { ...window, spine } };
        }
      }
      updateResidentEstimate(sessionId,prev,messages,target,updated)
      return {
        ...applySessionWindow(state,{...state.messagesById,[sessionId]:messages},sessionWindowById,state.loadedSessionIds,state.sessionLoadState,sessionId),
        sessionsMeta,
      };
    });
  },

  updateSessionTitle: (sessionId, title) => {
    set((state) => {
      if (!state.sessionsMeta.some((s) => s.id === sessionId)) return state;
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s,
      );
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      scheduleCloudUpsert('chat-session', sessionId);
      return { sessionsMeta };
    });
  },

  archiveSession: (sessionId, archived) => {
    set((state) => {
      if (!state.sessionsMeta.some((s) => s.id === sessionId)) return state;
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.id === sessionId ? { ...s, archived } : s,
      );
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      return { sessionsMeta };
    });
  },

  /** 系统项目：水合后补齐两个（笔记记录 / 划词摘录），只补缺的，不动用户改过的名字。 */
  ensureDefaultProjects: () => {
    set((state) => {
      const folders = ensureDefaultProjectRows(state.folders);
      if (!folders) return state;
      persistManifest(state, manifestOf(state, { folders }));
      return { folders };
    });
  },

  setActiveProject: (projectId) => {
    const state = get();
    const next = projectId && state.folders.some((folder) => folder.id === projectId) ? projectId : null;
    if (state.activeProjectId === next) return;
    set({ activeProjectId: next });
    persistManifest(get(), manifestOf(get(), { activeProjectId: next }));
  },

  createFolder: (name, opts) => {
    const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    set((state) => {
      const userCount = state.folders.filter((folder) => !isSystemProject(folder)).length;
      const folders = [
        ...state.folders,
        {
          id,
          name: (name ?? '').trim() || `新建项目 ${userCount + 1}`,
          createdAt: now,
          updatedAt: now,
          ...(opts?.system ? { system: opts.system } : {}),
        },
      ];
      persistManifest(state, manifestOf(state, { folders }));
      return { folders };
    });
    scheduleCloudUpsert('chat-project', id);
    return id;
  },

  renameFolder: (folderId, name) => {
    const next = name.trim();
    if (!next) return;
    let changed = false;
    set((state) => {
      const folders = state.folders.map((f) => {
        if (f.id !== folderId || f.name === next) return f;
        changed = true;
        return { ...f, name: next, updatedAt: Date.now() };
      });
      if (!changed) return state;
      persistManifest(state, manifestOf(state, { folders }));
      return { folders };
    });
    // 项目名要跨设备可见：改名走云端 upsert（删除那条路径走 tombstone）。
    if (changed) scheduleCloudUpsert('chat-project', folderId);
  },

  deleteFolder: (folderId) => {
    const target = get().folders.find((folder) => folder.id === folderId);
    // 系统项目（笔记记录 / 划词摘录）不可删：成员由来源决定，删了这些会话就无处安放。
    if (!target || isSystemProject(target)) return false;
    set((state) => {
      const folders = state.folders.filter((f) => f.id !== folderId);
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.folderId === folderId ? { ...s, folderId: null } : s,
      );
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta, folders }));
      return {
        folders,
        sessionsMeta,
        activeProjectId: state.activeProjectId === folderId ? null : state.activeProjectId,
      };
    });
    scheduleCloudTombstone('chat-project', folderId);
    return true;
  },

  moveSessionToFolder: (sessionId, folderId) => {
    let moved = false;
    set((state) => {
      const target = state.sessionsMeta.find((s) => s.id === sessionId);
      if (!target) return state;
      // 系统项目里的会话（note / floating / scheduled）归属由来源决定，不允许改挂到别的项目。
      if (target.kind === 'note' || target.kind === 'floating' || target.kind === 'scheduled') return state;
      if ((target.folderId ?? null) === (folderId ?? null)) return state;
      moved = true;
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.id === sessionId ? { ...s, folderId } : s,
      );
      persistManifest(state, manifestOf(state, { sessions: sessionsMeta }));
      return { sessionsMeta };
    });
    // 归属变化要跟着会话一起上云，否则换设备看不到它进了哪个项目。
    if (moved) scheduleCloudUpsert('chat-session', sessionId);
  },

  rememberReadSlices: (sessionId, sliceIds) => {
    if (sliceIds.length === 0) return;
    const state = get();
    const target = state.sessionsMeta.find((s) => s.id === sessionId);
    if (!target) return;
    const before = target.readSliceIds ?? [];
    const next = mergeRememberedSlices(before, sliceIds);
    // 没有新增就别落盘：读完同样的片会反复触发这个调用。
    // 注意不能只比长度——到上限后长度不变、内容会滚动。
    if (next.length === before.length && next.every((id, index) => id === before[index])) return;
    const sessionsMeta = state.sessionsMeta.map((s) =>
      s.id === sessionId ? { ...s, readSliceIds: next } : s,
    );
    set({ sessionsMeta });
    persistManifest(get(), manifestOf(get(), { sessions: sessionsMeta }));
  },
}));

registerResourceMetrics(()=>{
  const state=useChatHistory.getState()
  return {loadedSessionCount:Object.keys(state.messagesById).length,pinnedSessionCount:state.pinnedSessionIds.length,hotMessageEstimatedBytes:[...residentEstimates.values()].reduce((sum,item)=>sum+item.bytes,0)}
})

/** Cloud pull joins the same real-residency LRU path as local window loads. */
export function applyCloudSessionWindow(meta:SessionMeta,messages:ChatMessage[],sessionsMeta:SessionMeta[]):void{
  const sliced=tailWindowSlice(messages)
  useChatHistory.setState(state=>{
    const windows={...state.sessionWindowById,[meta.id]:{
      startTurn:sliced.startTurn,startIndex:sliced.startIndex,turnCount:sliced.spine.length,messageCount:messages.length,spine:sliced.spine,
    }}
    return {
      sessionsMeta,
      ...applySessionWindow({...state,sessionsMeta},{...state.messagesById,[meta.id]:sliced.messages},windows,[...state.loadedSessionIds.filter(id=>id!==meta.id),meta.id],{...state.sessionLoadState,[meta.id]:'loaded'},meta.id),
    }
  })
}
onStorageOwnerChange((previous,next)=>{
  if(previous===next)return
  bootstrapPromise=null
  sessionLeases.clear();residentEstimates.clear();pinnedPressureBytes=0
  legacyPins.clear()
  useChatHistory.setState({sessionsMeta:[],folders:[],activeProjectId:null,messagesById:{},sessionWindowById:{},activeSessionId:null,sessionLoadState:{},loadedSessionIds:[],pinnedSessionIds:[],_hasHydrated:false,_activeMessagesReady:false})
})

/** 启动时迁移 + 加载 manifest 与当前会话（幂等）。 */
export async function ensureChatHistoryBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  const ownerId=getStorageOwner(),epoch=getOwnerEpoch();
  const current=()=>ownerId!==null&&getStorageOwner()===ownerId&&getOwnerEpoch()===epoch;
  bootstrapPromise = (async () => {
    if (typeof window === 'undefined') return;
    await migrateFromV1IfNeeded();
    if(!current())return;
    const manifest = await loadManifest();
    if(!current())return;
    const store = useChatHistory.getState();
    if (manifest) {
      const folders = manifest.folders ?? [];
      // 落点项目必须还存在：项目被删掉后 manifest 里可能留下悬空 id。
      const activeProjectId =
        manifest.activeProjectId && folders.some((folder) => folder.id === manifest.activeProjectId)
          ? manifest.activeProjectId
          : null;
      useChatHistory.setState({
        sessionsMeta: manifest.sessions,
        folders,
        activeSessionId: manifest.activeSessionId,
        activeProjectId,
        _hasHydrated: true,
      });
      // 两个系统项目必须在**水合之后**补：persistManifest 的闸门要求 _hasHydrated，
      // 而且补的动作要基于盘上真实的 folders，绝不能基于空数组。
      useChatHistory.getState().ensureDefaultProjects();
      if (manifest.activeSessionId) {
        await store.ensureSessionLoaded(manifest.activeSessionId);
        if(!current())return;
        useChatHistory.getState()._setActiveMessagesReady(true);
      } else {
        useChatHistory.getState()._setActiveMessagesReady(true);
      }
    } else {
      useChatHistory.setState({ _hasHydrated: true, _activeMessagesReady: true });
      useChatHistory.getState().ensureDefaultProjects();
    }
    if(!current())return;
    // 运行状态记录是本地副产物：别的设备删掉的会话、被淘汰的会话，徽标一并清。
    useSessionRuns.getState().prune(new Set(useChatHistory.getState().sessionsMeta.map((s) => s.id)));
    scheduleOrphanChatGc();
  })();
  return bootstrapPromise;
}

type ChatHistoryPersistShim = {
  hasHydrated: () => boolean;
  onHydrate: (fn: () => void) => () => void;
  onFinishHydration: (fn: () => void) => () => void;
};

// 兼容 useHydrated(useChatHistory)
(useChatHistory as typeof useChatHistory & { persist: ChatHistoryPersistShim }).persist = {
  hasHydrated: () => useChatHistory.getState()._hasHydrated,
  onHydrate: (fn: () => void) => {
    fn();
    return () => {};
  },
  onFinishHydration: (fn: () => void) => {
    if (useChatHistory.getState()._hasHydrated) {
      fn();
      return () => {};
    }
    return useChatHistory.subscribe((s) => {
      if (s._hasHydrated) fn();
    });
  },
};
