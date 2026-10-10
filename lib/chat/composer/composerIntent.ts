/** 输入框计划模式 / 强制工具 / 笔记引用。客户端与 /api/chat 共用。 */

export const NOTEBOOK_FILE_MIME = "application/x-notebook-file-ref";

export const FORCED_COMPOSER_TOOLS = [
  "generateImage",
  "renderInteractive",
  "writeDocument",
  "flashcards",
  "notes",
] as const;

export type ForcedComposerTool = (typeof FORCED_COMPOSER_TOOLS)[number];

export type ComposerForcedTool = ForcedComposerTool | `skill:${string}`;

export type AttachedFileKind = "file" | "folder";

export interface AttachedFileRef {
  path: string;
  title: string;
  kind: AttachedFileKind;
  /** 给人看的详细地址，如「概率论 › 详解 › 随机事件与概率 › 古典概型」。 */
  address: string;
  subjectId: string;
  categoryId: string;
  itemId: string;
  /** 文件夹拖入时带上子项 path，方便 Agent 定向 getSection。 */
  childPaths?: string[];
}

export const COMPOSER_PLAN_LABEL = "计划模式";
export const COMPOSER_COMPACT_LABEL = "压缩上下文";

export const FORCED_TOOL_LABELS: Record<ForcedComposerTool, string> = {
  generateImage: "生成图片",
  renderInteractive: "可交互网页",
  writeDocument: "生成长文",
  flashcards: "整理闪卡",
  notes: "整理笔记",
};

export function isForcedComposerTool(value: string | undefined): value is ForcedComposerTool {
  return !!value && (FORCED_COMPOSER_TOOLS as readonly string[]).includes(value);
}

export function isComposerForcedTool(value: string | undefined): value is ComposerForcedTool {
  return !!value && (isForcedComposerTool(value) || value.startsWith("skill:"));
}

export function skillForcedTool(skillId: string): ComposerForcedTool {
  return `skill:${skillId}`;
}

export function forcedSkillId(forcedTool: string | undefined): string | undefined {
  return forcedTool?.startsWith("skill:") ? forcedTool.slice("skill:".length) : undefined;
}

export function filePathOf(subjectId: string, categoryId: string, itemId: string): string {
  return `${subjectId}/${categoryId}/${itemId}`;
}

export function parseFilePath(path: string): { subjectId: string; categoryId: string; itemId: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  return { subjectId: parts[0]!, categoryId: parts[1]!, itemId: parts.slice(2).join("/") };
}

export function normalizeAttachedFile(raw: Partial<AttachedFileRef> & { path?: string }): AttachedFileRef | null {
  const parsed = raw.path ? parseFilePath(raw.path) : null;
  const subjectId = raw.subjectId || parsed?.subjectId;
  const categoryId = raw.categoryId || parsed?.categoryId;
  const itemId = raw.itemId || parsed?.itemId;
  if (!subjectId || !categoryId || !itemId) return null;
  const path = raw.path || filePathOf(subjectId, categoryId, itemId);
  const title = (raw.title || itemId).trim() || itemId;
  return {
    path,
    title,
    kind: raw.kind === "folder" ? "folder" : "file",
    address: (raw.address || path).trim() || path,
    subjectId,
    categoryId,
    itemId,
    childPaths: raw.childPaths?.filter(Boolean).slice(0, 64),
  };
}

export function mergeAttachedFiles(current: AttachedFileRef[], incoming: AttachedFileRef[]): AttachedFileRef[] {
  const next = [...current];
  for (const file of incoming) {
    if (next.some((item) => item.path === file.path)) continue;
    if (next.length >= 16) break;
    next.push(file);
  }
  return next;
}

export function readNotebookFileDrag(dataTransfer: DataTransfer | null): AttachedFileRef[] {
  if (!dataTransfer) return [];
  const raw = dataTransfer.getData(NOTEBOOK_FILE_MIME) || dataTransfer.getData("text/plain");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .map((item) => (item && typeof item === "object" ? normalizeAttachedFile(item as AttachedFileRef) : null))
      .filter((item): item is AttachedFileRef => !!item);
  } catch {
    const single = normalizeAttachedFile({ path: raw.trim() });
    return single ? [single] : [];
  }
}

export function writeNotebookFileDrag(dataTransfer: DataTransfer, files: AttachedFileRef[]): void {
  const payload = JSON.stringify(files);
  dataTransfer.setData(NOTEBOOK_FILE_MIME, payload);
  dataTransfer.setData("text/plain", files.map((file) => file.path).join("\n"));
  dataTransfer.effectAllowed = "copy";
}

export function hasNotebookFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(NOTEBOOK_FILE_MIME);
}

export interface ResolveForcedToolContext {
  editingUserNote?: unknown;
  memoryCommit?: "note" | "flashcards";
}

/** UI 强制项 → 实际工具名。技能走 useSkill；笔记/闪卡按当前会话能力落地。 */
export function resolveForcedToolName(
  forcedTool: string | undefined,
  ctx: ResolveForcedToolContext = {},
): string | undefined {
  if (!forcedTool) return undefined;
  if (forcedTool.startsWith("skill:")) return "useSkill";
  if (forcedTool === "generateImage") return "generateImage";
  if (forcedTool === "renderInteractive") return "renderInteractive";
  if (forcedTool === "writeDocument") return "writeDocument";
  if (forcedTool === "flashcards") {
    return ctx.memoryCommit === "flashcards" ? "commitFlashcards" : "proposeMemory";
  }
  if (forcedTool === "notes") {
    if (ctx.editingUserNote) return "updateUserNote";
    return ctx.memoryCommit === "note" ? "commitNotes" : "proposeMemory";
  }
  return forcedTool;
}

export function formatForcedToolLine(forcedTool: string | undefined, skillName?: string): string {
  if (!forcedTool) return "";
  if (forcedTool.startsWith("skill:")) {
    const name = skillName || forcedTool.slice("skill:".length);
    return `【指定技能】本轮必须调用 useSkill，参数 name 用「${name}」加载该技能全文；仍可调用其它工具。`;
  }
  const label = isForcedComposerTool(forcedTool) ? FORCED_TOOL_LABELS[forcedTool] : forcedTool;
  const toolName = resolveForcedToolName(forcedTool);
  return `【指定工具】本轮必须至少调用一次 ${toolName ?? forcedTool}（${label}）；仍可调用其它工具。`;
}
