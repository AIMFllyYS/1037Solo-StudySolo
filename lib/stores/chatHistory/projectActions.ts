import { ensureDefaultProjects as ensureDefaultProjectRows, isSystemProject } from '@/lib/storage/chatStorage';

import { mergeRememberedSlices } from '@/lib/project/sessionSlices';
import { scheduleCloudTombstone, scheduleCloudUpsert } from '@/lib/sync/schedule';

import type { ChatHistoryState, HistorySet, HistoryGet } from "./stateTypes";
import { persistManifest, manifestOf } from "./manifest";

export function createProjectActions(set: HistorySet, get: HistoryGet): Pick<ChatHistoryState, "ensureDefaultProjects" | "setActiveProject" | "createFolder" | "renameFolder" | "deleteFolder" | "moveSessionToFolder" | "rememberReadSlices"> {
  return {
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
    }
  };
}
