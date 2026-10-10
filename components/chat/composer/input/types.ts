import React from 'react';

import type { ChatContext } from '@/lib/types/chat';
import type { SendMessageOptions } from '@/lib/chat/sendMessage';

import { type AttachedFileRef, type ComposerForcedTool } from '@/lib/chat/composer/composerIntent';

export interface ChatInputProps {
  onSend: (content: string, options?: SendMessageOptions) => void;
  onStop: () => void;
  isLoading: boolean;
  /**
   * 本输入框写入的会话 id。生成中再发的消息会进队列；队列项绑定当时所在会话——
   * 切到别的会话后 drain 不会把这条会话的待发消息错发给另一条。
   */
  sessionId?: string;
  chatContext: ChatContext;
  onOpenSettings?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** 受控模型（划词浮窗每窗独立选模型）；不传则模型菜单读写全局 useSettings。 */
  modelId?: string;
  onModelChange?: (id: string) => void;
  /** 是否显示上下文 token 看板（划词浮窗传 false，避免显示主面板的全局统计）。默认 true。 */
  showTokenDashboard?: boolean;
  /** 划词浮窗的 sessionId，用于独立 token 统计。不传则用全局 tracker。 */
  floatingSessionId?: string;
  /** 禁用「引用到输入框」（划词浮窗传 true，避免全局选区引用串入浮窗）。默认 false。 */
  disableQuote?: boolean;
  /**
   * 局部引用槽：提供时优先于全局 quotedText（disableQuote 只屏蔽全局那条）。
   * 笔记内嵌 Agent 等独立会话用它隔离引用，不串进主对话。
   */
  quoteText?: string | null;
  /** 局部引用槽的清除回调；不传则走全局 clearQuotedText。 */
  onClearQuote?: () => void;
  /** 浮动输入区占用的底部安全距离（高度 + 实际底距 + 呼吸间距），供会话滚动区避让。 */
  onComposerInsetChange?: (inset: number) => void;
  /** 可选上下文警告等内容：与输入区一起测量，避免被底部浮层遮住。 */
  notice?: React.ReactNode;
  /** 自增即聚焦输入框一次（例如点了「新建对话」但其实已经在新对话里，提示用户直接开说）。 */
  focusSignal?: number;
  /**
   * 显示「对话所属项目」chip（输入框右下角）。
   * 只有 Agent 中央对话传 true：划词浮窗 / 题目解析 / 手机迷你聊天都不该出现项目归属。
   */
  showProjectPicker?: boolean;
  /** Agent 执行模式（询问/完全同意）入口；由 ChatPanel 默认开启，迷你输入框保持关闭。 */
  showAgentModeMenu?: boolean;
}

export type QueuedMessage = {
  id: string;
  /** 排队时所在会话：drain 只放与当前会话一致的项，防止跨会话错发。 */
  sessionId?: string;
  content: string;
  quotedText?: string;
  attachments?: SendMessageOptions["attachments"];
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
};

export type PaletteKind = "slash" | "hash" | null;