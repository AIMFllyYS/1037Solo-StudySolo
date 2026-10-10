import { EXAMPLE_USER_NOTE_ID, isClassroomNote, type UserNote } from "@/lib/notes/userNote";

/** 按更新时间倒序取笔记；subjectId 为 string 时只取该科，null/undefined 取全部。 */
export function selectUserNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
): UserNote[] {
  return order
    .map((id) => byId[id])
    .filter((note): note is UserNote => Boolean(note))
    .filter((note) => (subjectId == null ? true : note.subjectId === subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 选择笔记（cite）列表：当前筛选下若看不到案例，补进来当默认可见示例。
 * 不改变用户笔记排序；案例未归档时在学科筛选里仍能看见。
 */
export function selectLibraryNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
  opts?: { includeExample?: boolean },
): UserNote[] {
  const notes = selectUserNotes(byId, order, subjectId).filter((note) => !isClassroomNote(note));
  if (!opts?.includeExample) return notes;
  const example = byId[EXAMPLE_USER_NOTE_ID];
  if (!example || notes.some((note) => note.id === example.id)) return notes;
  return [...notes, example].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 选择笔记 · 课堂笔记栏：只列划词便签，不混进个人长笔记。 */
export function selectClassroomNotes(
  byId: Record<string, UserNote>,
  order: string[],
  subjectId?: string | null,
): UserNote[] {
  return selectUserNotes(byId, order, subjectId).filter((note) => isClassroomNote(note));
}