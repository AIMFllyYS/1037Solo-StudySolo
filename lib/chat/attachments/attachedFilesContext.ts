import { findContentItem, readContentMarkdown } from "@/lib/content/loader";
import { PLAN_MODE_RULE } from "@/lib/ai/agent/planMode";
import { formatForcedToolLine, normalizeAttachedFile, type AttachedFileRef } from "@/lib/chat/composer/composerIntent";

const PER_FILE_CHARS = 24_000;
const TOTAL_CHARS = 48_000;

function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  return { text: `${text.slice(0, max)}\n…（已截断，完整正文请用 getSection(path)）`, clipped: true };
}

/** 把附加笔记的详细地址（及可读取的正文）拼进易变段，等同打开该页当上下文。 */
export function formatAttachedFilesVolatile(files: AttachedFileRef[]): string {
  if (files.length === 0) return "";
  const blocks: string[] = [];
  let used = 0;
  for (const raw of files) {
    const file = normalizeAttachedFile(raw) ?? raw;
    const found = findContentItem(file.subjectId, file.categoryId, file.itemId);
    const address = file.address
      || (found
        ? [found.subjectName, found.categoryName, found.parentTitle, found.item.title].filter(Boolean).join(" › ")
        : file.path);
    const children = file.childPaths?.length ? `\n  子项 path：${file.childPaths.join("、")}` : "";
    let body = "";
    if (file.kind !== "folder" && used < TOTAL_CHARS) {
      const md = readContentMarkdown(file.subjectId, file.categoryId, file.itemId);
      if (md) {
        const clipped = clip(md, Math.min(PER_FILE_CHARS, TOTAL_CHARS - used));
        used += clipped.text.length;
        body = `\n\n${clipped.text}`;
      } else {
        body = "\n\n（正文未找到，请用 getSection(path) 再取。）";
      }
    }
    blocks.push(`- ${address}\n  path: ${file.path}${children}${body}`);
  }
  return `【用户附加的笔记】下列页面已作为本轮上下文（与打开该页相同）。需要其它页时用 getSection(path) 取全文。\n${blocks.join("\n\n")}`;
}

export function formatComposerVolatile(input: {
  planMode?: boolean;
  forcedTool?: string;
  forcedSkillName?: string;
  attachedFiles?: AttachedFileRef[];
}): string {
  const parts: string[] = [];
  if (input.planMode) parts.push(PLAN_MODE_RULE);
  const forced = formatForcedToolLine(input.forcedTool, input.forcedSkillName);
  if (forced && !input.planMode) parts.push(forced);
  const attached = formatAttachedFilesVolatile(input.attachedFiles ?? []);
  if (attached) parts.push(attached);
  return parts.join("\n\n");
}
