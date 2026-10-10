import type { ChatSession } from "@/lib/chat/sessionTypes";

import type { ChatMessage } from '@/lib/types/chat';
import { type ChatManifestV2, type SessionMeta, manifestFrom, saveManifest } from '@/lib/storage/chatStorage';

import type { ChatHistoryState } from "./stateTypes";
export function metaToChatSession(meta: SessionMeta, messages: ChatMessage[]): ChatSession {
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
export function persistManifest(state: ChatHistoryState, manifest: ChatManifestV2): void {
  if (!state._hasHydrated) return;
  saveManifest(manifest);
}

/**
 * 从当前状态出发构造 manifest，只覆盖显式传入的字段。
 * **不允许手写 manifest 字面量**：2026-09-19 的会话清空事故与之后的「云端拉取丢 projects」
 * 都是漏字段造成的，多一个入口就多一次漏的机会。
 */
export function manifestOf(
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
export function isBlankMainSession(meta: SessionMeta): boolean {
  // 'scheduled' 会话不算空白新对话：startNewChat 复用空白的语义是「用户自己还没输入」，
  // 把一条待触发/中断的调度会话回收成普通新对话会让运行记录与内容脱节。
  return meta.kind !== 'floating' && meta.kind !== 'note' && meta.kind !== 'scheduled' && !meta.archived && meta.messageCount === 0;
}

export function pruneArtifactsFromMetas(_metas: SessionMeta[]): void {
  // Independent assets outlive their source conversation. Only an explicit
  // asset deletion may tombstone them; removing a chat must not delete imports,
  // retained drafts, diagrams, or other reusable completed products.
  void _metas;
}
