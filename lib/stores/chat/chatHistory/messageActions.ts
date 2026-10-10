import { mergeArtifactIds, appendSessionMessages, writeSessionMessage, saveSessionMessages, persistInlineAttachments } from '@/lib/storage/chatStorage';
import { tailWindowSlice, turnCountsOf } from '@/lib/chat/messages/turnSpine';
import { getMessageText } from '@/lib/chat/messages/messageParts';

import { scheduleCloudUpsert } from '@/lib/sync/schedule';

import type { ChatHistoryState, HistorySet } from "./stateTypes";
import { persistManifest, manifestOf } from "./manifest";
import { residentEstimates, applySessionWindow, runtimeSpineAppend, sameStringArray, updateResidentEstimate, estimateHotValueBytes } from "./windowRuntime";
export function createMessageActions(set: HistorySet): Pick<ChatHistoryState, "addMessage" | "replaceMessages" | "updateMessage" | "updateSessionTitle" | "setContextCheckpoint" | "archiveSession"> {
  return {
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
        const updated = { ...target, ...updates, contentRevision: (target.contentRevision??0)+1 };
        const messages = prev.map((m) => (m.id === messageId ? updated : m));
        // 流式期每 tick 都会走这里：只在 artifactIds 真变化时才新建 meta/数组——
        // 否则 sessionsMeta 每 tick 都是新引用，侧栏/历史层/项目 chip 全量重渲。
        let shouldSaveManifest = false;
        let sessionsMeta = state.sessionsMeta;
        const metaIndex = state.sessionsMeta.findIndex((s) => s.id === sessionId);
        if (metaIndex >= 0) {
          const meta = state.sessionsMeta[metaIndex];
          const artifactIds = mergeArtifactIds(meta.artifactIds, [updated]);
          const invalidateCheckpoint = meta.contextCheckpoint?.coveredIds.includes(messageId) && JSON.stringify(target.parts) !== JSON.stringify(updated.parts);
          if (!sameStringArray(meta.artifactIds, artifactIds) || invalidateCheckpoint) {
            sessionsMeta = state.sessionsMeta.slice();
            sessionsMeta[metaIndex] = { ...meta, updatedAt: Date.now(), artifactIds, ...(invalidateCheckpoint ? { contextCheckpoint: undefined } : {}) };
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
  setContextCheckpoint: (sessionId, checkpoint) => {
      set(state => {
        if (!state.sessionsMeta.some(meta => meta.id === sessionId)) return state;
        const sessionsMeta = state.sessionsMeta.map(meta => meta.id === sessionId ? { ...meta, contextCheckpoint: checkpoint, updatedAt: Date.now() } : meta);
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
    }
  };
}
