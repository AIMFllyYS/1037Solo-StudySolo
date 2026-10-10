/**
 * 选出「正在交给 Agent 的那篇个人笔记」。
 *
 * 与写入无关：Agent 只会在 volatile 段看到这篇的正文，改动一律产出候选稿，
 * 由确认卡经用户同意后落地（lib/stores/noteChangeProposals.ts）。
 */
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import type { EditingUserNoteContext } from "@/lib/notes/editingUserNote";

/** 正在交给 Agent 的已打开个人笔记；关掉编辑器后返回 null。 */
export function selectEditingUserNote(noteId?: string | null): EditingUserNoteContext | null {
  const state = useUserNotes.getState();
  const id = noteId === undefined ? state.agentEditingNoteId : noteId;
  if (!id || !state.openEditorIds.includes(id)) return null;
  const note = state.byId[id];
  if (!note) return null;
  return { id: note.id, title: note.title, markdown: note.markdown, updatedAt: note.updatedAt };
}
