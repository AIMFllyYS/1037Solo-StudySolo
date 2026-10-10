import {
  ACADEMIC_YEAR_IDS,
  ACADEMIC_YEAR_LABELS,
  filterSubjectsByYear,
  type AcademicYearId,
} from "@/lib/constants/academic-year";
import { SUBJECT_REGISTRY } from "@/lib/content-data/subjects.registry";
import { subjectLabel } from "@/lib/notes/userNote";

/** 加号菜单与闪卡管理窗标题。 */
export const FLASHCARD_PICKER_TITLE = "复习闪卡页面";

export function flashcardPickerTitle(subjectId: string | null): string {
  return subjectId ? `${FLASHCARD_PICKER_TITLE} · ${subjectLabel(subjectId)}` : FLASHCARD_PICKER_TITLE;
}

/** 换科目时只改出处第一段（学科名），后面的板块 / 章节保持原样。 */
export function retargetCardSourceLabel(sourceLabel: string, nextSubjectId: string): string {
  const name = subjectLabel(nextSubjectId);
  const parts = sourceLabel.split(" / ").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return name;
  return [name, ...parts.slice(1)].join(" / ");
}

export interface FlashcardSubjectFolder {
  id: string;
  name: string;
  fullName: string;
}

export interface FlashcardSubjectGroup {
  yearId: AcademicYearId;
  label: string;
  subjects: FlashcardSubjectFolder[];
}

/** 学期一级分区，学科来自书架 registry，不另造学科表。 */
export function listFlashcardSubjectGroups(): FlashcardSubjectGroup[] {
  return ACADEMIC_YEAR_IDS.flatMap((yearId) => {
    const subjects = filterSubjectsByYear([...SUBJECT_REGISTRY], yearId).map((meta) => ({
      id: meta.id,
      name: meta.shortName,
      fullName: meta.name,
    }));
    if (subjects.length === 0) return [];
    return [{ yearId, label: ACADEMIC_YEAR_LABELS[yearId], subjects }];
  });
}
