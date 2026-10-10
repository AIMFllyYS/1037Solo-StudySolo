import type { ChatSession, SessionWindowMeta } from "@/lib/chat/sessionTypes";

import type { ChatMessage, ChatContext } from '@/lib/types/chat';
import { type ChatFolder, type SessionMeta } from '@/lib/storage/chatStorage';

import type { StoreApi } from "zustand";
export interface ChatHistoryState {
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
  setContextCheckpoint: (sessionId: string, checkpoint: NonNullable<SessionMeta['contextCheckpoint']>) => void;
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
export type HistorySet = StoreApi<ChatHistoryState>["setState"];
export type HistoryGet = StoreApi<ChatHistoryState>["getState"];
