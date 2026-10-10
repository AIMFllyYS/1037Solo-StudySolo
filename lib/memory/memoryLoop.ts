// 记忆闭环（不是教材批注）：
// 学 → 问 Agent → 提议笔记/闪卡 → 学生确认 → 短提纲或复习卡落库 →
// 加号菜单 / 书架 / 复习板再进入 → 需要时再引用回对话。
// 长文本（writeDocument）和可交互 HTML（renderInteractive）是另一类产物，只被导入，不在这里生成。

import type { ChatMessage } from "@/lib/types/chat";
import { getToolPartsByName } from "@/lib/chat/messages/messageParts";
import type { MemoryKind, ProposeMemoryOutput } from "@/lib/ai/agent/tools/proposeMemory/types";
import type { CommitNotesOutput } from "@/lib/ai/agent/tools/commitNotes/types";
import type { CommitFlashcardsOutput } from "@/lib/ai/agent/tools/commitFlashcards/types";
import type { RecordMode } from "@/lib/review/types";
import { buildNoteCommitPrompt } from "@/lib/memory/noteCommitPrompt";
import { buildFlashcardCommitPrompt } from "@/lib/memory/flashcardCommitPrompt";

/** 二次调用 Agent 时才把对应 commit 工具 schema 暴露给模型。 */
export type MemoryCommitKind = "note" | "flashcards";

export function memoryCommitOf(kind: MemoryKind): MemoryCommitKind {
  return kind === "note" ? "note" : "flashcards";
}

export interface MemoryProposalEvent {
  proposalId: string;
  toolCallId: string;
  messageId: string;
  kind: MemoryKind;
  reason: string;
  titleHint?: string;
  suggestedMode?: RecordMode;
  /** 提案来自哪条会话（ingest 时盖戳）：commit 要按它取整段上下文，窗口化后不能靠扫已加载消息猜。 */
  sessionId?: string;
}

export interface MemoryCommitEvent {
  toolCallId: string;
  messageId: string;
  kind: MemoryKind;
  notes?: CommitNotesOutput;
  flashcards?: CommitFlashcardsOutput;
}

export function collectMemoryToolEvents(messages: readonly ChatMessage[], sessionId?: string): {
  proposals: MemoryProposalEvent[];
  commits: MemoryCommitEvent[];
} {
  const proposals: MemoryProposalEvent[] = [];
  const commits: MemoryCommitEvent[] = [];

  for (const message of messages) {
    for (const part of getToolPartsByName(message, "proposeMemory")) {
      if (part.state !== "output-available" || part.preliminary) continue;
      const output = part.output as ProposeMemoryOutput;
      if (!output?.proposalId || (output.kind !== "note" && output.kind !== "flashcard")) continue;
      proposals.push({
        proposalId: output.proposalId,
        toolCallId: part.toolCallId,
        messageId: message.id,
        kind: output.kind,
        reason: output.reason,
        titleHint: output.titleHint,
        suggestedMode: output.suggestedMode,
        sessionId,
      });
    }

    for (const part of getToolPartsByName(message, "commitNotes")) {
      if (part.state !== "output-available" || part.preliminary) continue;
      commits.push({
        toolCallId: part.toolCallId,
        messageId: message.id,
        kind: "note",
        notes: part.output as CommitNotesOutput,
      });
    }

    for (const part of getToolPartsByName(message, "commitFlashcards")) {
      if (part.state !== "output-available" || part.preliminary) continue;
      commits.push({
        toolCallId: part.toolCallId,
        messageId: message.id,
        kind: "flashcard",
        flashcards: part.output as CommitFlashcardsOutput,
      });
    }
  }

  return { proposals, commits };
}

export function shouldAcceptProposal(
  liveKinds: readonly MemoryKind[],
  incoming: MemoryProposalEvent,
  alreadyHasId: boolean,
): boolean {
  if (alreadyHasId) return false;
  return !liveKinds.includes(incoming.kind);
}

export function buildCommitPrompt(kind: MemoryKind, extras: { title?: string; mode?: RecordMode }): string {
  if (kind === "note") {
    return buildNoteCommitPrompt(extras.title);
  }
  return buildFlashcardCommitPrompt(extras.mode);
}
