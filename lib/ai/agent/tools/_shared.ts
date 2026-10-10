import type { Skill } from "@/lib/types/skill";
import type { AcademicYearId } from "@/lib/constants/academic-year";
import type { TextToolOutput } from "@/lib/ai/agent/tools/_types";
import type { EditingUserNoteContext } from "@/lib/notes/editor/editingUserNote";
import type { ClassAgentContext } from "@/lib/class/agentContext";
import type { FlashcardCatalogItem, UserNoteCatalogItem } from "@/lib/ai/agent/tools/memoryCatalog";
import type {
  ProjectFileCatalogItem,
  ProjectSlicePayload,
} from "@/lib/ai/agent/tools/projectFiles/types";

export const IMAGE_SEARCH_MAX_TOTAL = 20;
export { MAX_TOOL_STEPS, clampMaxToolRounds } from "@/lib/ai/agent/toolRounds";
/** 第 6 步仍返回 tool-calls、没有第 7 次 LLM 消化时下发给用户。 */
export const TOOL_STEP_LIMIT_INFO =
  "本次达到了工具调用上限，讲解可能不完整，可以再问一次让我继续。";

export interface StudyToolContext {
  localFiles?: import('@/lib/local-files/contract').LocalSourceCatalog;
  subjectId: string;
  categoryId: string;
  itemId: string;
  /** 本次请求携带的全部技能（含正文），供 useSkill 按名取用。 */
  skills: Skill[];
  /** 当前 UI 学年。getOutline / searchNotes 默认只搜该学年，crossYear 可放开。 */
  academicYear: AcademicYearId;
  /** 发起本次对话时选中的模型 id（透传给 renderInteractive / generateImage 的前端卡片）。 */
  modelId?: string;
  /** 生图模式下当前模型不支持 HTML 交互生成的提示。 */
  artifactUnsupportedReason?: string;
  /** 学生从笔记窗打开助教时，当前正在编辑的个人笔记。 */
  editingUserNote?: EditingUserNoteContext;
  /** 本机个人笔记目录（主对话携带；窗内对话为空，避免翻整库）。 */
  userNotes?: UserNoteCatalogItem[];
  /** 本机复习闪卡目录（复用复习板，不另开存储）。 */
  flashcards?: FlashcardCatalogItem[];
  /**
   * 项目文件目录（索引，不含正文）：本机解析产物，服务端读不到浏览器存储，所以随请求上行。
   * 正文只在 projectSlices 里（「带入对话」的那部分）。
   */
  projectFiles?: ProjectFileCatalogItem[];
  /** 本轮携带的项目切片正文。 */
  projectSlices?: ProjectSlicePayload[];
  /** 发起请求的登录用户（课堂文稿等按账号读库的工具用）。 */
  userId?: string;
  /** Class 模式携带的当前课堂；有值时才暴露 searchClassTranscript。 */
  classContext?: ClassAgentContext;
}

/** 跨工具轮次的可变状态（同一请求内共享）。 */
export interface StudyToolRuntime {
  imageSearchFetchedCount: number;
  loadedContextKeys: Set<string>;
  /** 本轮回答的下一个 [n] 编号；只在真正注入新来源时递增。 */
  nextCiteIndex: number;
}

export function createToolRuntime(): StudyToolRuntime {
  return { imageSearchFetchedCount: 0, loadedContextKeys: new Set(), nextCiteIndex: 1 };
}

export function normalizeContextKeyPart(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** 同一 contextKey 在本次对话工具链中已注入过 → 只回「已加载」提示，避免重复展开全文。 */
export function dedupeByContextKey<T extends TextToolOutput & { contextKey?: string; deduped?: boolean }>(
  runtime: StudyToolRuntime,
  toolName: string,
  output: T,
): T {
  if (!output.contextKey) return output;
  if (runtime.loadedContextKeys.has(output.contextKey)) {
    return {
      ...output,
      deduped: true,
      text: `【上下文已加载】${toolName} 的上下文 ${output.contextKey} 已在本次对话工具链中注入过，请引用前文已加载内容，不要重复展开全文。`,
    };
  }
  runtime.loadedContextKeys.add(output.contextKey);
  return output;
}

/** toModelOutput 只回灌 text（必须以内联 lambda 形式传入，预先定型的函数会破坏 tool() 的 OUTPUT 推断）。 */
export const toText = (output: TextToolOutput) => ({ type: "text" as const, value: output.text });

export function menuSkillNamesOf(skills: Skill[]): string[] {
  return skills.filter((s) => !s.pinned).map((s) => s.name).filter(Boolean);
}
