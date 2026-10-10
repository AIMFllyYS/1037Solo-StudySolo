import type { ChatContext, ChatMessage } from "@/lib/types/chat";
import type { TurnSpineEntry } from "@/lib/chat/turnSpine";
export interface SessionMeta {
  contextCheckpoint?: { summary: string; coveredIds: string[]; coveredRevisions?:Record<string,number>; cloudFileIds: string[]; createdAt: number };
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  kind?: 'main' | 'floating' | 'note' | 'scheduled';
  context?: ChatContext;
  messageCount: number;
  preview?: string;
  artifactIds: string[];
  /** 归档后从「正常对话 / 划词助手对话」默认列表移出，仍在本地可恢复。 */
  archived?: boolean;
  /** 用户自建文件夹；缺省表示未分组。 */
  folderId?: string | null;
  /**
   * 本会话已经读进过上下文的项目切片 id（去重 + FIFO，上限见 project/sessionSlices.ts）。
   * 项目一大，携带计划就从「全带」翻成「只带勾选的」；记住这些 id 能让模型读过的东西
   * 在后续轮次继续可读，而不是下一轮就报「这一轮没有携带切片正文」。
   */
  readSliceIds?: string[];
}

/** 系统项目的来源标记：笔记窗内 Agent 会话 / 划词助手会话 / 定时任务会话。 */
export type ProjectSystemKind = 'note' | 'floating' | 'scheduled';

/**
 * 对话项目（= 会话分组，可选字段，老 manifest 无此项时按空数组处理）。
 * `system` 有值的项目由来源决定成员，不可删除、可重命名。
 */
export interface ChatFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  system?: ProjectSystemKind;
}

export interface ChatManifestV2 {
  version: 2;
  activeSessionId: string | null;
  sessions: SessionMeta[];
  folders?: ChatFolder[];
  /** 下一次「新建对话」的落点项目；null = 不使用项目。 */
  activeProjectId?: string | null;
}

/** 能构造 manifest 的状态切片（chatHistory store 与云同步引擎都是这个形状）。 */
export interface ManifestSource {
  activeSessionId: string | null;
  sessionsMeta: SessionMeta[];
  folders: ChatFolder[];
  activeProjectId: string | null;
}

export interface SessionHeadV3 {
  v: 3;
  /** Optional in legacy v3; zero for old heads. */
  contentRevision?:number;
  messageCount: number;
  turnCount: number;
  chunkCount: number;
  spine: TurnSpineEntry[];
}

/** 已加载会话窗口的描述（store 的 sessionWindowById 直接用它）。 */
export interface SessionWindowLoad {
  messages: ChatMessage[];
  spine: TurnSpineEntry[];
  turnCount: number;
  messageCount: number;
  startTurn: number;
  /** 窗口首条消息在全量数组里的下标。 */
  startIndex: number;
}

export interface ChatGcDeps {
  listKeys?: () => Promise<string[]>;
  removeKey?: (key: string) => Promise<void>;
  loadMessages?: (sessionId: string) => Promise<ChatMessage[] | null>;
  loadManifest?: () => Promise<ChatManifestV2 | null>;
}
