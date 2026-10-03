// Agent 工具服务端入口。只允许 studyAgent 与 API route 引用。
// 不要从客户端（components、lib/hooks、tools/index）导入本文件或各工具的 tool.ts。

import type { ToolSet } from "ai";
import { createLearningConnectorsTool } from "@/lib/ai/agent/tools/learningConnectors/tool";
import { createKitSoloTool } from "@/lib/ai/agent/tools/kitSolo/tool";
import type { StudyToolName } from "@/lib/ai/agent/tools/names";
import {
  menuSkillNamesOf,
  type StudyToolContext,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";
import { createGetCurrentPageTool } from "@/lib/ai/agent/tools/getCurrentPage/tool";
import { createGetOutlineTool } from "@/lib/ai/agent/tools/getOutline/tool";
import { createGetSectionTool } from "@/lib/ai/agent/tools/getSection/tool";
import { createSearchNotesTool } from "@/lib/ai/agent/tools/searchNotes/tool";
import { createSearchFlashcardsTool } from "@/lib/ai/agent/tools/searchFlashcards/tool";
import { createSearchNoteImagesTool } from "@/lib/ai/agent/tools/searchNoteImages/tool";
import { createWebSearchTool } from "@/lib/ai/agent/tools/webSearch/tool";
import { createImageSearchTool } from "@/lib/ai/agent/tools/imageSearch/tool";
import { createRenderInteractiveTool } from "@/lib/ai/agent/tools/renderInteractive/tool";
import { createDrawDiagramTool } from "@/lib/ai/agent/tools/drawDiagram/tool";
import { createGenerateImageTool } from "@/lib/ai/agent/tools/generateImage/tool";
import { createCreateQuizTool } from "@/lib/ai/agent/tools/createQuiz/tool";
import { createWriteDocumentTool } from "@/lib/ai/agent/tools/writeDocument/tool";
import { createGetArtifactTool } from "@/lib/ai/agent/tools/getArtifact/tool";
import { createUseSkillTool } from "@/lib/ai/agent/tools/useSkill/tool";
import { createProposeMemoryTool } from "@/lib/ai/agent/tools/proposeMemory/tool";
import { createCommitNotesTool } from "@/lib/ai/agent/tools/commitNotes/tool";
import { createCommitFlashcardsTool } from "@/lib/ai/agent/tools/commitFlashcards/tool";
import { createUpdateUserNoteTool } from "@/lib/ai/agent/tools/updateUserNote/tool";
import { createGetProjectFilesTool } from "@/lib/ai/agent/tools/getProjectFiles/tool";
import { createReadProjectSlicesTool } from "@/lib/ai/agent/tools/readProjectSlices/tool";
import { createSearchClassTranscriptTool } from "@/lib/ai/agent/tools/searchClassTranscript/tool";
import type { EditingUserNoteContext } from "@/lib/notes/editingUserNote";
import type { ArtifactCatalogItem } from "@/lib/ai/agent/tools/getArtifact/types";
import { PLAN_MODE_WRITE_TOOL_SET } from "@/lib/ai/agent/planMode";

export {
  IMAGE_SEARCH_MAX_TOTAL,
  clampMaxToolRounds,
  TOOL_STEP_LIMIT_INFO,
  createToolRuntime,
  type StudyToolContext,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";

export interface BuildStudyToolsOptions {
  /** Account introspection UUID; never supplied by chat request JSON. */
  connectorOwner?: string;
  kitSoloAccessToken?: string;
  enableSearch: boolean;
  disabled?: string[];
  /** 请求携带的演示目录（html 只给 getArtifact，不进 prompt）。始终暴露该工具，避免工具 schema 随有无产物 bust。 */
  artifacts?: ArtifactCatalogItem[];
  /**
   * 记忆闭环第二步：学生确认后才把完整 commit schema 暴露给模型。
   * 未确认时只给 proposeMemory，避免模型直接写笔记/闪卡。
   */
  memoryCommit?: "note" | "flashcards";
  /**
   * 正在编辑的个人笔记（窗内对话，或主对话引用了某篇打开的笔记）。
   * updateUserNote 恒定暴露：主对话也能凭目录 id 产出候选稿；
   * 但无论哪个入口，写入都必须由用户在确认卡上同意（见 lib/stores/noteChangeProposals.ts）。
   */
  editingUserNote?: EditingUserNoteContext;
  /** 窗内笔记 Agent 不暴露演示/生图/长文等重工具。 */
  noteWindowAgent?: boolean;
  /** 计划模式：只暴露只读工具，写文档/HTML/生图等不注册。 */
  planMode?: boolean;
  /** 输入框强制工具：窗内对话即使默认隐藏，也要暴露这一个。 */
  forcedToolName?: string;
}

const NOTE_WINDOW_HIDDEN_TOOLS = new Set<StudyToolName>([
  "searchNotes",
  "searchFlashcards",
  "renderInteractive",
  "drawDiagram",
  "generateImage",
  "createQuiz",
  "writeDocument",
  "proposeMemory",
  "commitNotes",
  "commitFlashcards",
]);

/**
 * 构建本次请求的工具集。
 * - enableSearch 控制是否暴露 webSearch/imageSearch；
 * - disabled 来自用户设置；
 * - useSkill 只在有可调用技能时暴露，技能名作为 enum（提升选名准确度，且会话内稳定利于 prefix 缓存）。
 */
export function buildStudyTools(
  ctx: StudyToolContext,
  runtime: StudyToolRuntime,
  opts: BuildStudyToolsOptions,
): ToolSet {
  const disabled = new Set(opts.disabled ?? []);
  const menuSkillNames = menuSkillNamesOf(ctx.skills);

  const all = {
    learningConnectors: createLearningConnectorsTool(opts.connectorOwner, ctx.flashcards, !opts.planMode && !opts.noteWindowAgent),
    kitSolo: createKitSoloTool(opts.kitSoloAccessToken ?? ""),
    getCurrentPage: createGetCurrentPageTool(ctx, runtime),
    getOutline: createGetOutlineTool(ctx, runtime),
    getSection: createGetSectionTool(ctx, runtime),
    searchNotes: createSearchNotesTool(ctx, runtime),
    searchFlashcards: createSearchFlashcardsTool(ctx, runtime),
    webSearch: createWebSearchTool(runtime),
    imageSearch: createImageSearchTool(runtime),
    searchNoteImages: createSearchNoteImagesTool(ctx, runtime),
    createQuiz: createCreateQuizTool(),
    writeDocument: createWriteDocumentTool(ctx),
    renderInteractive: createRenderInteractiveTool(ctx),
    drawDiagram: createDrawDiagramTool(),
    generateImage: createGenerateImageTool(ctx),
    getArtifact: createGetArtifactTool(opts.artifacts ?? []),
    useSkill: createUseSkillTool(ctx, runtime),
    proposeMemory: createProposeMemoryTool(),
    commitNotes: createCommitNotesTool(),
    commitFlashcards: createCommitFlashcardsTool(),
    updateUserNote: createUpdateUserNoteTool(ctx),
    getProjectFiles: createGetProjectFilesTool(ctx),
    readProjectSlices: createReadProjectSlicesTool(ctx, runtime),
    searchClassTranscript: createSearchClassTranscriptTool(ctx, runtime),
  } satisfies Record<StudyToolName, unknown>;

  // 稳定工具在前；enableSearch / useSkill 易变，追加在末尾，失效范围可解释。
  const names: StudyToolName[] = [
    "getCurrentPage",
    "getOutline",
    "getSection",
    "searchNotes",
    "searchFlashcards",
    "searchNoteImages",
    "renderInteractive",
    "drawDiagram",
    "generateImage",
    "createQuiz",
    "writeDocument",
    "getArtifact",
    "proposeMemory",
    "updateUserNote",
    // 项目文件：目录与切片都随请求体上行，工具本身恒定暴露（catalog 空时给引导文案）。
    "getProjectFiles",
    "readProjectSlices",
  ];
  if (opts.memoryCommit === "note") names.push("commitNotes");
  if (opts.connectorOwner) names.push("learningConnectors");
  if (opts.kitSoloAccessToken && !opts.noteWindowAgent) names.push("kitSolo");
  if (opts.memoryCommit === "flashcards") names.push("commitFlashcards");
  // 课堂文稿只在 Class 模式（请求带了课堂上下文且已登录）时出现。
  if (ctx.classContext && ctx.userId) names.push("searchClassTranscript");
  if (opts.enableSearch) names.push("webSearch", "imageSearch");
  if (menuSkillNames.length > 0) names.push("useSkill");
  const forced = opts.forcedToolName as StudyToolName | undefined;
  if (forced && (forced in all) && !names.includes(forced) && !opts.planMode) {
    names.push(forced);
  }

  const selected: ToolSet = {};
  for (const n of names) {
    if (disabled.has(n)) continue;
    if (opts.noteWindowAgent && NOTE_WINDOW_HIDDEN_TOOLS.has(n) && n !== opts.forcedToolName) continue;
    if (opts.planMode && PLAN_MODE_WRITE_TOOL_SET.has(n)) continue;
    selected[n] = all[n];
  }
  return selected;
}
