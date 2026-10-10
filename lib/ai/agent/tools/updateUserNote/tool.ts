import { tool } from "ai";
import { z } from "zod";
import type { UpdateUserNoteAction, UpdateUserNoteOutput } from "@/lib/ai/agent/tools/updateUserNote/types";
import { findUserNote } from "@/lib/ai/agent/tools/memoryCatalog";
import { toText, type StudyToolContext } from "@/lib/ai/agent/tools/_shared";
import { EDITING_NOTE_CONTEXT_MAX_CHARS } from "@/lib/notes/editor/editingUserNote";
import { markdownDigest } from "@/lib/notes/proposals/noteChangeProposal";

/** 缺 toolCallId 时的稳定兜底幂等键：同目标同内容 → 同 id。 */
function fallbackProposalId(action: string, noteId: string, markdown: string): string {
  let hash = 5381;
  for (let i = 0; i < markdown.length; i += 1) {
    hash = ((hash << 5) + hash + markdown.charCodeAt(i)) | 0;
  }
  return `${action}:${noteId}:${markdown.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * updateUserNote：产出「改/删某篇个人笔记」的候选稿，交给前端确认。
 *
 * 这里**不做任何数据变更**，也不代表用户已经同意。前端确认卡在用户点击后才写入，
 * 并对原文版本做乐观并发校验。详见 lib/stores/noteChangeProposals.ts。
 */
export function createUpdateUserNoteTool(ctx: StudyToolContext) {
  return tool({
    description:
      "为学生写一份个人笔记的修改/删除候选稿。你不会直接改动笔记：前端会把候选稿交给学生确认，学生点「同意修改」后才真正写入，所以不要在回复里说已经改好。省略 noteId 时针对当前打开的那篇；否则用 searchNotes 列表里的 id。action=update 给出完整 Markdown；action=delete 提出删除该篇。原文被截断时不要提交整篇替换。不要用 writeDocument 或 commitNotes 代替改稿。新建短笔记仍走 proposeMemory + commitNotes。不要在聊天正文里重复全文。",
    inputSchema: z.object({
      action: z.enum(["update", "delete"]).optional().describe("默认 update。delete 提议删除个人笔记。"),
      noteId: z.string().optional().describe("要改/删的个人笔记 id。省略则改当前打开的那篇。"),
      markdown: z.string().optional().describe("update 时写回的完整 Markdown，可用 $KaTeX$"),
      title: z.string().optional().describe("可选，同时改标题；省略则只改正文"),
    }),
    execute: async (input, { toolCallId }): Promise<UpdateUserNoteOutput> => {
      const action: UpdateUserNoteAction = input.action ?? "update";
      const noteId = input.noteId?.trim() || ctx.editingUserNote?.id || "";
      const catalogNote = noteId ? findUserNote(ctx.userNotes ?? [], noteId) : undefined;
      const openNote = ctx.editingUserNote?.id === noteId ? ctx.editingUserNote : undefined;
      const proposalId = toolCallId || fallbackProposalId(action, noteId, input.markdown ?? "");

      const base = {
        proposalId,
        noteId,
        action,
        markdown: "",
        sourceComplete: true,
        baseDigest: "",
        summary: "",
      };

      if (!noteId || (!catalogNote && !openNote)) {
        return {
          ...base,
          text: "没有可改写的个人笔记。请先 searchNotes(scope=\"personal\") 取得 id，或在打开的笔记里改当前篇。不要用 writeDocument 或 commitNotes 代替。",
          ok: false,
          title: input.title,
        };
      }

      // 模型实际读到的正文：窗内是被 8000 字截断的版本，目录里是被 6000 字截断的版本。
      const sourceComplete = openNote
        ? openNote.markdown.length <= EDITING_NOTE_CONTEXT_MAX_CHARS
        : !catalogNote?.truncated;
      // 指纹取「笔记正文本身」：窗内用客户端送来的全文，主对话用目录里记的正文指纹。
      const baseDigest = openNote ? markdownDigest(openNote.markdown) : (catalogNote?.markdownDigest ?? "");
      const label = catalogNote?.title || openNote?.title || "无标题笔记";

      if (action === "delete") {
        return {
          ...base,
          text: `已生成删除「${label}」的候选操作，等学生在前端点「确认删除」。请用一句话告诉学生，不要复述正文。`,
          ok: true,
          sourceComplete,
          baseDigest,
          summary: `删除笔记「${label}」`,
        };
      }

      const markdown = input.markdown?.trim() ?? "";
      if (!markdown) {
        return {
          ...base,
          text: "改写笔记需要提供完整 markdown。",
          ok: false,
          title: input.title,
          sourceComplete,
          baseDigest,
        };
      }

      const title = input.title?.trim() || undefined;
      const nextLabel = title ?? label;
      return {
        ...base,
        text: `已生成「${label} → ${nextLabel}」的候选稿，等学生在前端点「同意修改」。请用一句话说明改了什么，不要复述全文。`,
        ok: true,
        markdown,
        title,
        sourceComplete,
        baseDigest,
        summary: title && title !== label
          ? `修改笔记「${label}」，并改名为「${title}」`
          : `修改笔记「${label}」`,
      };
    },
    toModelOutput: ({ output }) => toText(output),
  });
}
