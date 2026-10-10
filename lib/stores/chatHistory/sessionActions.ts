import { type SessionMeta, dropSessionTailCache, saveSessionMessages, deleteSessionData, listBlobIdsForSession, scheduleOrphanChatGc } from '@/lib/storage/chatStorage';

import { scheduleCloudTombstone, scheduleCloudUpsert } from '@/lib/sync/schedule';
import { useSessionRuns } from '@/lib/stores/sessionRuns';

import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import type { ChatHistoryState, HistorySet, HistoryGet } from "./stateTypes";
import { persistManifest, manifestOf, isBlankMainSession, pruneArtifactsFromMetas } from "./manifest";
import { residentEstimates, applySessionWindow, EMPTY_WINDOW } from "./windowRuntime";
export function createSessionActions(set: HistorySet, get: HistoryGet, bootstrap: () => Promise<void>): Pick<ChatHistoryState, "createSession" | "startNewChat" | "deleteSession" | "switchSession"> {
  return {
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
        void bootstrap()
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
    }
  };
}
