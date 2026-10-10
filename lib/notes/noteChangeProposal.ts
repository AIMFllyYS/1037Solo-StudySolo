/**
 * 笔记变更候选稿（纯逻辑，不碰 store / DOM）。
 *
 * 链路：updateUserNote 工具产出候选稿 → 前端确认卡 → 用户点同意 → 版本校验 → 一次写入。
 * 这里只放「怎么把工具输出变成候选稿」和「候选稿能不能落地」两件事，
 * 状态机与幂等账本在 lib/stores/noteChangeProposals.ts。
 */
import type { UpdateUserNoteOutput } from "@/lib/ai/agent/tools/updateUserNote/types";
import { getToolPartsByName } from "@/lib/chat/messages/messageParts";
import type { ChatMessage } from "@/lib/types/chat";

/**
 * 正文指纹（FNV-1a 32 位 + 长度）。
 *
 * 用它当版本号而不是 UserNote.updatedAt：updatedAt 是毫秒时间戳，
 * 「候选稿生成」与「用户手动保存」落在同一毫秒时无法区分，版本校验会静默失效。
 * 指纹比对的是模型真正读到的那段正文，语义也正是我们要防的事——原文变过就拒绝整篇替换。
 */
export function markdownDigest(markdown: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < markdown.length; i += 1) {
    hash ^= markdown.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${markdown.length.toString(36)}-${hash.toString(36)}`;
}

export type NoteChangeAction = "update" | "delete";

export type NoteChangeStatus = "pending" | "applied" | "dismissed" | "stale" | "blocked";

/** 用户在确认卡上看到的候选稿。字段都是内部实现细节，不是权限模式。 */
export interface NoteChangeProposal {
  /** 幂等键，等于产生它的 toolCallId。 */
  id: string;
  sessionId: string | null;
  noteId: string;
  noteTitle: string;
  action: NoteChangeAction;
  markdown: string;
  title?: string;
  summary: string;
  /** 草稿所依据的正文指纹（markdownDigest）；空串 = 无从校验，按「不校验」处理。 */
  baseDigest: string;
  /** false = 模型只读到被截断的原文，禁止整篇替换。 */
  sourceComplete: boolean;
  createdAt: number;
}

/** 服务端是否产出了一份真正可确认的候选稿。 */
export function isUsableOutput(output: UpdateUserNoteOutput | undefined | null): boolean {
  if (!output?.ok || !output.noteId || !output.summary) return false;
  if (output.action === "delete") return true;
  return output.markdown.trim().length > 0;
}

export function proposalFromToolOutput(
  output: UpdateUserNoteOutput,
  opts: { sessionId: string | null; noteTitle?: string; createdAt?: number },
): NoteChangeProposal | null {
  if (!isUsableOutput(output)) return null;
  return {
    id: output.proposalId,
    sessionId: opts.sessionId,
    noteId: output.noteId,
    noteTitle: opts.noteTitle || output.title || "无标题笔记",
    action: output.action,
    markdown: output.markdown,
    ...(output.title ? { title: output.title } : {}),
    summary: output.summary,
    baseDigest: output.baseDigest ?? "",
    sourceComplete: output.sourceComplete !== false,
    createdAt: opts.createdAt ?? Date.now(),
  };
}

/**
 * 从消息历史里收集候选稿。**只读**：这里不做任何写入，
 * 消息历史只是候选稿的载体，重放历史不会产生变更。
 */
export function collectNoteChangeProposals(
  messages: readonly ChatMessage[],
  sessionId: string | null,
): NoteChangeProposal[] {
  const proposals: NoteChangeProposal[] = [];
  for (const message of messages) {
    for (const part of getToolPartsByName(message, "updateUserNote")) {
      if (part.state !== "output-available" || part.preliminary) continue;
      const proposal = proposalFromToolOutput(part.output, { sessionId });
      if (proposal) proposals.push(proposal);
    }
  }
  return proposals;
}

export type NoteChangeCheck =
  | { ok: true }
  | { ok: false; status: Extract<NoteChangeStatus, "stale" | "blocked">; reason: string };

/**
 * 点「同意」时的落地前校验。三类拒绝：
 * 1. 目标已不存在（不给它重新创建）；
 * 2. 模型只读到截断原文（不许整篇替换，会丢尾部）；
 * 3. 草稿产生后用户又改过（保留用户的最新正文，让草稿重做）。
 */
export function checkProposalAgainstNote(
  proposal: NoteChangeProposal,
  note: { markdown: string } | undefined,
): NoteChangeCheck {
  if (!note) {
    return { ok: false, status: "stale", reason: "这篇笔记已经不存在了，没有可改的内容。" };
  }
  if (!proposal.sourceComplete) {
    return {
      ok: false,
      status: "blocked",
      reason: "原文过长，模型只读到前面一部分。整篇替换会丢掉没读到的内容，已阻止这次写入。",
    };
  }
  if (proposal.baseDigest && markdownDigest(note.markdown) !== proposal.baseDigest) {
    return {
      ok: false,
      status: "stale",
      reason: "这篇笔记在候选稿生成之后被改过，为避免覆盖你的新内容，已阻止这次写入。可以让助手重新整理一次。",
    };
  }
  return { ok: true };
}
