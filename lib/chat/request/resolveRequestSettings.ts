import { getModelInfoWithCustom, type CustomApiGroup, type ModelInfo, type ThinkingEffort } from "@/lib/ai/models";
import type { ChatAttachment, ChatOptions } from "@/lib/types/chat";
import type { MemoryCommitKind } from "@/lib/memory/memoryLoop";
import type { AttachedFileRef, ComposerForcedTool } from "@/lib/chat/composer/composerIntent";

export interface SendMessageOptions {
  quotedText?: string;
  /** 引用导语（不含冒号）：默认「针对当前页面这段原文」，笔记会话用「针对这篇笔记这段原文」。 */
  quoteIntro?: string;
  enableThinking?: boolean;
  thinkingEffort?: ThinkingEffort;
  enableSearch?: boolean;
  attachments?: ChatAttachment[];
  memoryCommit?: MemoryCommitKind;
  /** 计划模式：本轮只读。斜杠 / 加号代理传入，设置页不开关。 */
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
  /**
   * 显式目标会话：排队消息 drain 时用——队列是按「排队时所在会话」绑定的，
   * 切走会话后回来 drain 不能落到当时 active 的另一条会话上。
   */
  sessionId?: string;
}

export interface RequestSettingsInput {
  selectedModelId: string;
  customApiGroups: CustomApiGroup[];
  defaultThinkingEffort: ThinkingEffort;
}

export interface ResolvedRequestSettings {
  effectiveModelId: string;
  model: ModelInfo | undefined;
  enableThinking: boolean;
  thinkingEffort: ThinkingEffort | undefined;
  enableSearch: boolean | undefined;
  contextMode: "full" | "semantic";
}

export function resolveRequestSettings(
  settings: RequestSettingsInput,
  options: ChatOptions | undefined,
  sendOptions: SendMessageOptions | undefined,
  ovModelId?: string,
): ResolvedRequestSettings {
  const effectiveModelId = ovModelId ?? settings.selectedModelId;
  const model = getModelInfoWithCustom(effectiveModelId, settings.customApiGroups);
  const requestedThinking = sendOptions?.enableThinking ?? options?.enableThinking;
  const enableThinking = requestedThinking === true && model?.thinking === true;
  const thinkingEffort = enableThinking
    ? sendOptions?.thinkingEffort ?? options?.thinkingEffort ?? settings.defaultThinkingEffort
    : undefined;
  const enableSearch = sendOptions?.enableSearch ?? options?.enableSearch;
  const contextMode = options?.contextMode ?? "full";
  return { effectiveModelId, model, enableThinking, thinkingEffort, enableSearch, contextMode };
}
