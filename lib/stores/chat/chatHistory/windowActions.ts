import { loadSessionWindow, loadTurnsBefore } from '@/lib/storage/chatStorage';
import { EARLIER_TURNS_BATCH } from '@/lib/chat/messages/turnSpine';

import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import type { ChatHistoryState, HistorySet, HistoryGet } from "./stateTypes";
import { metaToChatSession } from "./manifest";
import { legacyPins, applySessionWindow, windowMetaFromLoad } from "./windowRuntime";
export function createWindowActions(set: HistorySet, get: HistoryGet): Pick<ChatHistoryState, "getSessions" | "pinSession" | "unpinSession" | "ensureSessionLoaded" | "loadEarlierTurns" | "jumpToTurn" | "ensureSessionFullyLoaded"> {
  return {
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
    }
  };
}
