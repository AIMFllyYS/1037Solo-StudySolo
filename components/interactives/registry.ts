import type { SubjectId } from "@/lib/types/content";
import type { InteractiveMeta } from "./catalog/types";
export type { InteractiveMeta } from "./catalog/types";
import { probabilityInteractives } from "./catalog/probability";
import { chemistryInteractives } from "./catalog/chemistry";

/** Public lookup/uniqueness owner. Entries are maintained by subject in catalog/. */
const interactives: InteractiveMeta[] = [
  ...probabilityInteractives,
  ...chemistryInteractives,
];

// 防御：交互 id 必须全局唯一。getInteractive 与内联 ::interactive{id=...} 均按裸 id
// 查找；若未来跨学科复用同一 id，这里在模块加载时立即抛错，避免静默返回错组件。
(() => {
  const seen = new Set<string>();
  for (const i of interactives) {
    if (seen.has(i.id)) {
      throw new Error(`[registry] 重复的交互 id: "${i.id}"（交互 id 必须全局唯一）`);
    }
    seen.add(i.id);
  }
})();

export function getInteractive(id?: string | null): InteractiveMeta | undefined {
  if (!id) return undefined;
  return interactives.find((i) => i.id === id);
}

export function getInteractivesForSection(
  subjectId: SubjectId,
  chapterId: string,
  sectionId: string,
): InteractiveMeta[] {
  return interactives.filter(
    (i) =>
      i.subjectId === subjectId &&
      i.chapterId === chapterId &&
      i.sectionId === sectionId,
  );
}
