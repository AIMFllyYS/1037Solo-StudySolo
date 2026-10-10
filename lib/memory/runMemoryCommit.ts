// 记忆批准的旁路请求：复用当前对话前缀（history + 同一套 body 构造），
// 只在末尾追加撰写指令，不写入主 thread。笔记 / 闪卡共用。

import { createAssistantPlaceholder, createUserMessage } from "@/lib/chat/messageParts";
import { buildRequestMessages } from "@/lib/chat/buildRequestMessages";
import {
  buildChatRequestBody,
  estimateContextBudget,
  executeChatRequest,
  resolveRequestSettings,
} from "@/lib/chat/sendMessage";
import { collectRequestArtifacts } from "@/lib/context/compactArtifacts";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { useArtifacts } from "@/lib/stores/assets/artifacts";
import { useBillingStore, createBillingRecord } from "@/lib/stores/billing";
import { useSettings } from "@/lib/stores/settings";
import { useSkills } from "@/lib/stores/skills";
import { useStore } from "@/lib/stores/ui";
import { useTokenTracker } from "@/lib/stores/chat/tokenTracker";
import type { ChatContext, ChatMessage, ChatOptions } from "@/lib/types/chat";
import type { RecordMode } from "@/lib/review/types";
import type { MemoryCommitKind } from "@/lib/memory/memoryLoop";
import { buildNoteCommitPrompt } from "@/lib/memory/noteCommitPrompt";
import { buildFlashcardCommitPrompt } from "@/lib/memory/flashcardCommitPrompt";

export interface MemoryCommitSideTurn {
  persistToThread: false;
  memoryCommit: MemoryCommitKind;
  commitPrompt: string;
  userMessage: ChatMessage;
  assistant: ChatMessage;
  latestMessages: ChatMessage[];
}

export function buildMemoryCommitSideTurn(input: {
  historyMessages: readonly ChatMessage[];
  memoryCommit: MemoryCommitKind;
  title?: string;
  mode?: RecordMode;
}): MemoryCommitSideTurn {
  const commitPrompt = input.memoryCommit === "note"
    ? buildNoteCommitPrompt(input.title)
    : buildFlashcardCommitPrompt(input.mode);
  const userMessage = createUserMessage(crypto.randomUUID(), commitPrompt);
  const assistant = createAssistantPlaceholder(crypto.randomUUID(), {});
  return {
    persistToThread: false,
    memoryCommit: input.memoryCommit,
    commitPrompt,
    userMessage,
    assistant,
    latestMessages: [...input.historyMessages, userMessage, assistant],
  };
}

export function currentMemoryCommitChatContext(): ChatContext {
  const ui = useStore.getState();
  return {
    subjectId: ui.activeSubjectId,
    categoryId: ui.activeCategoryId,
    itemId: ui.activeItemId,
    currentTopic: `${ui.activeSubjectId} ${ui.activeCategoryId} ${ui.activeItemId}`,
    academicYear: useAcademicYear.getState().year,
  };
}

export interface RunMemoryCommitInput {
  historyMessages: readonly ChatMessage[];
  memoryCommit: MemoryCommitKind;
  title?: string;
  mode?: RecordMode;
  chatContext?: ChatContext;
  sessionId?: string;
  abortController?: AbortController;
  onWrite: (message: ChatMessage) => void;
}

export async function runMemoryCommit(input: RunMemoryCommitInput): Promise<ChatMessage> {
  const turn = buildMemoryCommitSideTurn({
    historyMessages: input.historyMessages,
    memoryCommit: input.memoryCommit,
    title: input.title,
    mode: input.mode,
  });
  const chatContext = input.chatContext ?? currentMemoryCommitChatContext();
  const settings = useSettings.getState();
  const lastAssistant = [...input.historyMessages].reverse().find((message) => message.role === "assistant");
  const options: ChatOptions = {
    enableThinking: lastAssistant?.metadata?.thinkingEnabled ?? settings.defaultThinking,
    enableSearch: lastAssistant?.metadata?.searchEnabled ?? settings.defaultSearch,
    contextMode: "full",
  };
  const resolved = resolveRequestSettings(settings, options, { memoryCommit: input.memoryCommit });
  const academicYear = chatContext.academicYear ?? useAcademicYear.getState().year;
  const { messages: estimateMessages } = buildRequestMessages(turn.latestMessages);
  const tracker = useTokenTracker.getState();
  const budget = estimateContextBudget(tracker, resolved.model, estimateMessages, turn.commitPrompt);
  const sessionId = input.sessionId ?? (input.memoryCommit === "note" ? "memory-note" : "memory-flashcards");
  const abortController = input.abortController ?? new AbortController();
  let latest = turn.assistant;

  await executeChatRequest({
    latestMessages: turn.latestMessages,
    abortSignal: abortController.signal,
    budget,
    body: buildChatRequestBody(
      chatContext,
      { ...settings, memoryCommit: input.memoryCommit },
      resolved,
      budget,
      useSkills.getState().skills,
      academicYear,
      collectRequestArtifacts(turn.latestMessages, useArtifacts.getState()),
    ),
    sessionId,
    userMessageId: turn.userMessage.id,
    assistant: turn.assistant,
    userContent: turn.commitPrompt,
    onWrite: (message) => {
      latest = message;
      input.onWrite(message);
    },
    onInfo: () => {},
    onContextBreakdown: (breakdown) => {
      if (input.sessionId) useTokenTracker.getState().setContextBreakdown(breakdown);
    },
    onUsage: (usage) => {
      if (usage.promptTokens <= 0 && usage.completionTokens <= 0) return;
      if (input.sessionId) useTokenTracker.getState().addUsage(usage);
      useBillingStore.getState().addRecord(createBillingRecord({
        type: "chat",
        modelId: usage.actualModelId
          ?? (resolved.model?.type === "image" ? settings.imageModeTextModel : resolved.effectiveModelId),
        sessionId,
        customGroups: settings.customApiGroups,
        usage,
      }));
    },
    onStall: () => {
      abortController.abort();
    },
    maxWaitMs: settings.maxWaitMs,
  });

  return latest;
}

export type MemoryCommitRunner = (input: RunMemoryCommitInput) => Promise<ChatMessage>;

let memoryCommitRunner: MemoryCommitRunner = runMemoryCommit;

export function runMemoryCommitWithRuntime(input: RunMemoryCommitInput): Promise<ChatMessage> {
  return memoryCommitRunner(input);
}

export function setMemoryCommitRunnerForTests(runner: MemoryCommitRunner | null): void {
  memoryCommitRunner = runner ?? runMemoryCommit;
}
