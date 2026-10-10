// 个人笔记的对外入口：加号菜单 / 书架卡片 / 键盘快捷键 / 笔记窗 AI 图标只调这里，
// 不直接摸 store，也不关心窗口 id 怎么拼。

import { useAgentProductPicker } from "@/lib/stores/workspace/agentProductPicker";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { useStore } from "@/lib/stores/ui";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { currentRecordContext } from "@/lib/review/recordContext";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import {
  deriveNoteTitle,
  formatNoteQuote,
  type ClassroomNoteSourceKind,
  type NoteLibraryIntent,
} from "@/lib/notes/userNote";
import type { SubjectId } from "@/lib/types/content";

function onBookshelfHome(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/";
}

function resolveSubjectId(explicit?: string | null): string | null {
  if (explicit !== undefined) return explicit;
  if (onBookshelfHome()) return null;
  return useStore.getState().activeSubjectId ?? null;
}

/**
 * 新建一篇空白笔记并打开编辑器。省略 subjectId 时绑定当前科目（首页书架则不归档）；显式传 null 则不归档。
 * `init` 给 Agent commitNotes 写入短提纲用。不复制案例模板。返回新笔记 id。
 */
export function createAndOpenNote(
  subjectId?: string | null,
  init?: { title?: string; markdown?: string },
): string {
  const bound = resolveSubjectId(subjectId);
  const notes = useUserNotes.getState();
  const id = notes.createNote(bound, init);
  notes.openEditor(id);
  return id;
}

export function openNoteEditor(noteId: string): void {
  useUserNotes.getState().openEditor(noteId);
}

/**
 * 笔记窗 AI 图标：在编辑窗内部展开微型 Agent，不抢右侧主对话。
 * 每篇笔记使用独立 session；写回仍走 updateUserNote。
 */
export function openAgentForUserNote(noteId: string): boolean {
  const notes = useUserNotes.getState();
  const note = notes.byId[noteId];
  if (!note || !notes.openEditorIds.includes(noteId)) return false;
  if (!notes.ensureNoteAgentSession(noteId)) return false;
  notes.setNoteAgentOpen(noteId, true);
  return true;
}

/**
 * 笔记窗「引用」：写进右侧主 Agent 引用托盘，并暴露 updateUserNote，让主对话能改这篇笔记。
 */
export function citeUserNoteToMainAgent(noteId: string): boolean {
  const notes = useUserNotes.getState();
  const note = notes.byId[noteId];
  if (!note) return false;
  if (notes.openEditorIds.includes(noteId)) notes.setAgentEditingNoteId(noteId);
  useChatUI.getState().setQuotedText(formatNoteQuote(note));
  const ui = useStore.getState();
  ui.setRightTab("ai");
  ui.setMobileTab("ai");
  // Agent 模式引用进的是中央主对话，不需要（也不该）改 Studio 档位的右栏开合。
  if (!isAgentWorkspace()) ui.setRightCollapsedForProfile(ui.layoutProfile, false);
  return true;
}

/**
 * 划词「笔记」：新建一篇课堂便签并打开小便签窗。
 * 原文写入 quote，批注正文空白，等用户在 compact Milkdown 里写。
 */
export function createAndOpenClassroomNote(input: {
  quote: string;
  sourceKind?: ClassroomNoteSourceKind;
  recordSubjectId?: SubjectId;
  subjectId?: string | null;
  anchor?: { x: number; y: number };
}): string | null {
  const quote = input.quote.trim();
  if (quote.length < 2) return null;
  const ctx = currentRecordContext(input.recordSubjectId);
  const bound = input.subjectId !== undefined ? input.subjectId : (ctx.subjectId || resolveSubjectId());
  const sourceKind = input.sourceKind ?? (input.recordSubjectId ? "review" : "content");
  const label =
    sourceKind === "agent"
      ? [ctx.sourceLabel, "Agent"].filter(Boolean).join(" · ") || "Agent 对话"
      : ctx.sourceLabel || "课堂";
  const notes = useUserNotes.getState();
  const id = notes.createNote(bound, {
    kind: "classroom",
    quote,
    title: deriveNoteTitle(quote),
    markdown: "",
    source: {
      kind: sourceKind,
      label,
      subjectId: bound,
      categoryId: ctx.categoryId,
      itemId: ctx.itemId,
      path: ctx.categoryId && ctx.itemId ? `${ctx.subjectId}/${ctx.categoryId}/${ctx.itemId}` : undefined,
    },
  });
  notes.openEditor(id, { anchor: input.anchor });
  return id;
}

/** browse = 书架「笔记」；cite = 加号菜单「选择笔记」（我的笔记 + 课堂笔记两栏）。 */
export function openNoteLibrary(opts?: { subjectId?: string | null; intent?: NoteLibraryIntent }): void {
  useUserNotes.getState().openLibrary({
    intent: opts?.intent,
    subjectId: resolveSubjectId(opts?.subjectId),
  });
}

export function openFlashcardCitePicker(opts?: { subjectId?: string | null }): void {
  useFlashcardCitations.getState().openPicker({
    subjectId: resolveSubjectId(opts?.subjectId),
  });
}

/** 加号菜单：从本机 documents store 挑一篇 Agent 长文本。 */
export function openDocumentImportPicker(): void {
  useAgentProductPicker.getState().openPicker("document");
}

/** 加号菜单：从本机 artifacts store 挑一份可交互 HTML。 */
export function openArtifactImportPicker(): void {
  useAgentProductPicker.getState().openPicker("artifact");
}
