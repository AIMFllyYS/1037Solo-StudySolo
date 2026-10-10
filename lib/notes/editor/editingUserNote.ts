/** 笔记编辑窗交给 Agent 的上下文（纯函数，服务端 / 客户端都能用）。 */

export interface EditingUserNoteContext {
  id: string;
  title: string;
  markdown: string;
  /** 草稿所依据的正文版本（UserNote.updatedAt）；旧调用方可不传。 */
  updatedAt?: number;
}

/** 写入 system 易变段的正文上限，避免一篇长笔记撑爆前缀后的定位段。 */
export const EDITING_NOTE_CONTEXT_MAX_CHARS = 8000;

/** 正文是否完整进入模型上下文；false 表示被截断，不得据此整篇替换。 */
export function isEditingNoteComplete(markdown: string): boolean {
  return markdown.length <= EDITING_NOTE_CONTEXT_MAX_CHARS;
}

/** 把正在编辑的个人笔记编进 Agent 易变上下文；写回走 updateUserNote 产出候选稿。 */
export function formatEditingUserNoteContext(note: EditingUserNoteContext): string {
  const title = note.title.trim() || "无标题笔记";
  const truncated = !isEditingNoteComplete(note.markdown);
  const markdown = truncated
    ? `${note.markdown.slice(0, EDITING_NOTE_CONTEXT_MAX_CHARS)}`
    : note.markdown;
  const lines = [
    `【正在编辑的个人笔记】id=${note.id} 标题「${title}」${truncated ? "（正文过长，下面只是前面一部分）" : ""}。`,
    "学生从笔记编辑窗打开了你。要改这篇笔记就调用 updateUserNote 产出候选稿——前端会把候选稿交给学生点「同意修改」，之后才真正写入。",
    "学生还没点同意时，不要声称已经保存、修改或删除；也不要在聊天正文里重复笔记全文。",
    "整理时保持原有标题层级，补全缺段、纠正错误，不要另起一篇。",
  ];
  if (truncated) {
    lines.push(
      `原文长于 ${EDITING_NOTE_CONTEXT_MAX_CHARS} 字，你只看到前面一部分。不要提交整篇替换（会丢掉没读到的结尾）；要么只针对上面这部分给出建议，要么请学生把范围缩小到某一节再改。`,
    );
  }
  lines.push("", markdown, truncated ? "\n…（以上为截断后的开头，不是全文）" : "");
  return lines.join("\n");
}
