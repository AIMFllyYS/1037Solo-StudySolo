import type { ChatHistoryState } from "./chatHistory/stateTypes";
import { sessionLeases, residentEstimates, applySessionWindow, resetWindowRuntime, type LeaseReason } from "./chatHistory/windowRuntime";
export { getHotSessionPressureBytes } from "./chatHistory/windowRuntime";
import { createWindowActions } from "./chatHistory/windowActions";
import { createSessionActions } from "./chatHistory/sessionActions";
import { createMessageActions } from "./chatHistory/messageActions";
import { createProjectActions } from "./chatHistory/projectActions";
export type { ChatSession, SessionWindowMeta } from "@/lib/chat/sessionTypes";
import { create } from 'zustand';
import type { ChatMessage } from '@/lib/types/chat';
import { type SessionMeta, loadManifest, migrateFromV1IfNeeded, scheduleOrphanChatGc } from '@/lib/storage/chatStorage';
import { tailWindowSlice } from '@/lib/chat/turnSpine';

import { useSessionRuns } from '@/lib/stores/sessionRuns';
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';

import {getOwnerEpoch,getStorageOwner,onStorageOwnerChange} from '@/lib/storage/ownerScope';
export function acquireSessionLease(sessionId:string,reason:LeaseReason){
  const reasons=sessionLeases.get(sessionId)??new Map<LeaseReason,number>()
  reasons.set(reason,(reasons.get(reason)??0)+1);sessionLeases.set(sessionId,reasons)
  let released=false
  return {sessionId,reason,release(){if(released)return;released=true;const current=sessionLeases.get(sessionId);if(!current)return;const count=(current.get(reason)??1)-1;if(count>0)current.set(reason,count);else current.delete(reason);if(!current.size)sessionLeases.delete(sessionId);useChatHistory.setState(state=>applySessionWindow(state,state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState))}}
}
export function enforceHotSessionBudget(){useChatHistory.setState(state=>applySessionWindow(state,state.messagesById,state.sessionWindowById,state.loadedSessionIds,state.sessionLoadState))}

let bootstrapPromise: Promise<void> | null = null;

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

  ...createWindowActions(set, get),
  ...createSessionActions(set, get, ensureChatHistoryBootstrap),
  ...createMessageActions(set),
  ...createProjectActions(set, get),
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
  resetWindowRuntime()
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
