import { noteHref, parseNotePath } from "@/lib/content/notePath";
import { useNoteLocator } from "@/lib/stores/learning/noteLocator";

/** 记下要滚动高亮的片段，并返回笔记路由。调用方再 `router.push`。 */
export function requestCitedNote(path: string, snippet = ""): string | null {
  useNoteLocator.getState().locate(path, snippet);
  const parsed = parseNotePath(path);
  return parsed ? noteHref(parsed) : null;
}
