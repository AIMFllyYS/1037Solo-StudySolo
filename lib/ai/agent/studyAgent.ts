// 学习助教 Agent：把 system prompt 拼装、工具集、思考参数、生图模式约束封装成一个 ToolLoopAgent。
// 每次请求创建一个实例（工具以闭包捕获请求上下文，成本可忽略）。
//
// 提示词：稳定前缀（global 教学法 + 学科 md + 用户设置）在前，
// 易变段（定位 / 参考材料 / 演示目录）在后，合并为唯一一条 system。

import { ToolLoopAgent, isStepCount, wrapLanguageModel, type ToolSet, type PrepareStepFunction } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { buildSystemPrompt, buildNoteSystemPrompt, buildLocationLine } from "@/lib/ai/prompts";
import type { ChatContext, ChatOptions } from "@/lib/types/chat";
import type { Skill } from "@/lib/types/skill";
import type { AcademicYearId } from "@/lib/constants/academic-year";
import type { ThinkingCallSettings } from "@/lib/ai/sdk/languageModel";
import {
  buildStudyTools,
  createToolRuntime,
  IMAGE_SEARCH_MAX_TOTAL,
  clampMaxToolRounds,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/server";
import { formatComposerVolatile } from "@/lib/chat/attachedFilesContext";
import type { AttachedFileRef, ComposerForcedTool } from "@/lib/chat/composerIntent";
import { forcedSkillId, resolveForcedToolName } from "@/lib/chat/composerIntent";
import { createAgentLifecycleHooks } from "@/lib/ai/observability/agentLog";
import { formatArtifactCatalog, type ArtifactCatalogItem } from "@/lib/context/compactArtifacts";
import type { MemoryCommitKind } from "@/lib/memory/memoryLoop";
import { isTextOnlyContinuation, type ContinuationKind } from "@/lib/ai/agent/completionGuard";
import { normalizeUserMaxOutputTokens } from "@/lib/ai/outputLimits";
import { formatEditingUserNoteContext, type EditingUserNoteContext } from "@/lib/notes/editingUserNote";
import { formatClassContextBlock, type ClassAgentContext } from "@/lib/class/agentContext";
import {
  formatMemoryCatalogLine,
  type FlashcardCatalogItem,
  type UserNoteCatalogItem,
} from "@/lib/ai/agent/tools/memoryCatalog";

export interface StudyAgentInput {
  /** Server-derived canonical Account UUID for native learning connector execution. */
  connectorOwner?: string;
  /** Server-derived, prior-consent KitSolo credential. Never comes from request JSON. */
  kitSoloAccessToken?: string;
  model: LanguageModelV4;
  chatCtx: ChatContext & { academicYear: AcademicYearId };
  options: ChatOptions;
  /** 已按 enableSearch / disabledTools 过滤前的用户禁用列表。 */
  disabledTools: string[];
  skills: Skill[];
  globalContext: string;
  /** 参考材料（上下文管理器产出），已按分级裁剪。 */
  referenceContext: string;
  /** 上下文达到 80% 软上限时置 true：参考材料已分级裁剪，历史走滚动摘要。 */
  contextTruncated: boolean;
  /** 已生成的演示目录（不含 HTML）。 */
  artifacts?: ArtifactCatalogItem[];
  /** 用户选择的是生图模型：强制每步只能调用 generateImage。 */
  isImageMode: boolean;
  /** 前端选中的模型 id（透传给 renderInteractive / generateImage 卡片）。 */
  selectedModelId?: string;
  modelSupportsTools: boolean;
  thinking: ThinkingCallSettings;
  temperature?: number;
  /** 学生确认沉淀后，本轮才暴露对应 commit 工具。 */
  memoryCommit?: MemoryCommitKind;
  /** 学生从笔记窗打开助教时，当前正在编辑的个人笔记。 */
  editingUserNote?: EditingUserNoteContext;
  /** 窗内笔记对话：收窄工具，提示词仍只改 volatile 段。 */
  noteWindowAgent?: boolean;
  /** 主对话随身携带的本机笔记/闪卡目录；窗内对话应传空。 */
  userNotes?: UserNoteCatalogItem[];
  flashcards?: FlashcardCatalogItem[];
  /** 工具循环上限（设置页「最大工具调用轮数」）。缺省 = MAX_TOOL_STEPS。 */
  maxToolRounds?: number;
  /** 计划模式：只读工具 + 先输出计划文档。斜杠 UI 由其它代理负责。 */
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
  /**
   * 收尾守卫续写（completionGuard）。answer / continue：关闭思考与工具，只写正文；
   * tool：沿用原工具集，让模型补发刚才只口头宣称的调用。
   */
  recovery?: ContinuationKind;
  /**
   * 用户在设置里定的「单次输出上限」（token，含思考）。缺省不下发，由计费层按
   * 落地模型的注册表声明最大输出补齐（见 providerAdmission.boundedCall）。
   */
  maxOutputTokens?: number;
  /** 发起请求的登录用户 id（课堂文稿工具按账号读库）。 */
  userId?: string;
  /** Class 模式的当前课堂上下文。 */
  classContext?: ClassAgentContext;
}


export interface StudyAgentBundle {
  agent: ToolLoopAgent<never, ToolSet>;
  /** 供 ContextBreakdown 分项统计的 system 各组成。 */
  promptParts: {
    baseSystemPrompt: string;
    globalContext: string;
    skillsMenuText: string;
    pinnedSkillsText: string;
    volatile: string;
    instructions: string;
  };
  tools: ToolSet;
  runtime: StudyToolRuntime;
}

const IMAGE_MODE_RULE =
  "## 生图模式硬性规则\n当前用户选择的是生图模型。无论用户输入什么，本次最终动作必须调用 generateImage 工具，把用户意图改写为清晰、可执行的生图提示词。不要用纯文字回答替代，不要调用 renderInteractive 或 drawDiagram。";

export function createStudyAgent(input: StudyAgentInput): StudyAgentBundle {
  const {
    model, chatCtx, options, disabledTools, skills, globalContext,
    referenceContext, contextTruncated, isImageMode, selectedModelId, modelSupportsTools, thinking,
    artifacts = [],
    memoryCommit,
    editingUserNote,
    noteWindowAgent,
    userNotes = [],
    flashcards = [],
    maxToolRounds,
    planMode,
    forcedTool,
    attachedFiles = [],
    recovery,
    maxOutputTokens: userMaxOutputTokens,
    userId,
    classContext,
  } = input;
  const textOnly = isTextOnlyContinuation(recovery);
  const toolRoundLimit = clampMaxToolRounds(maxToolRounds);

  // 稳定排序，保证拼装的系统前缀逐字节一致、利于缓存命中
  const sortedSkills = [...skills]
    .filter((s) => s.name)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pinnedSkills = sortedSkills.filter((s) => s.pinned);
  const menuSkills = sortedSkills.filter((s) => !s.pinned);

  // 笔记角色自成一条稳定前缀（短提纲体例 + 先征得同意的写入纪律），
  // 教学 Agent 继续用 global 教学法前缀。两者共用 correctness.md，各自命中自己的 prefix cache。
  const baseSystemPrompt = noteWindowAgent ? buildNoteSystemPrompt(chatCtx) : buildSystemPrompt(chatCtx);
  const skillsMenuText = menuSkills.length
    ? menuSkills.map((s) => `- ${s.name}：${s.description || "（无描述）"}`).join("\n")
    : "";
  const pinnedSkillsText = pinnedSkills.length
    ? pinnedSkills.map((s) => `### ${s.name}\n${s.content}`).join("\n\n")
    : "";

  const promptExtras: string[] = [];
  if (isImageMode) promptExtras.push(IMAGE_MODE_RULE);
  // 笔记 / 闪卡撰写指令放在旁路请求的最后一条 user 消息，不改 system 前缀，便于命中 prefix cache。
  if (globalContext) promptExtras.push(`## 全局补充上下文（用户提供，始终适用）\n${globalContext}`);
  if (pinnedSkillsText) promptExtras.push(`## 已固定启用的技能（用户手动开启，请始终遵循其指导）\n${pinnedSkillsText}`);
  if (skillsMenuText) {
    promptExtras.push(
      `## 可调用的技能库\n当下列技能与用户问题相关时，调用 useSkill 工具（参数 name 用技能名）加载其完整内容；一次只调用最相关的一个：\n${skillsMenuText}`,
    );
  }
  const systemPrompt = promptExtras.length
    ? `${baseSystemPrompt}\n\n---\n\n${promptExtras.join("\n\n---\n\n")}`
    : baseSystemPrompt;

  // 易变段必须后置：定位（换页/换学年）→ 当前笔记正文 → 参考材料 → 演示目录 → 压缩说明。
  // 稳定前缀（角色 + 学科 + 用户设置 + 工具清单）在 systemPrompt 里，同页追问可命中 prefix cache。
  // 笔记正文只出现在定位行之后，避免每篇笔记各自 bust 前缀（前面那段是逐字不变的笔记角色前缀）。
  const memoryLine = noteWindowAgent ? "" : formatMemoryCatalogLine(userNotes, flashcards);
  const forcedSkillName = forcedSkillId(forcedTool)
    ? sortedSkills.find((skill) => skill.id === forcedSkillId(forcedTool))?.name
    : undefined;
  const composerLine = formatComposerVolatile({
    planMode,
    forcedTool,
    forcedSkillName,
    attachedFiles,
  });
  const volatile =
    buildLocationLine(chatCtx) +
    (classContext && !noteWindowAgent ? `\n\n${formatClassContextBlock(classContext)}` : "") +
    (editingUserNote ? `\n\n${formatEditingUserNoteContext(editingUserNote)}` : "") +
    (memoryLine ? `\n\n${memoryLine}` : "") +
    (referenceContext ? `\n\n【参考材料】\n${referenceContext}` : "") +
    formatArtifactCatalog(artifacts) +
    (contextTruncated
      ? "\n\n【上下文策略】当前会话达到 80% 软上限，较早对话已压缩为摘要，参考材料已按目录/摘要分级裁剪。"
      : "") +
    (composerLine ? `\n\n${composerLine}` : "");

  // 必须只有「一条」system 消息且在最前：部分模型（如硅基流动 Qwen3）会对第二条 system 报错。
  const instructions = volatile ? `${systemPrompt}\n\n${volatile}` : systemPrompt;

  const runtime = createToolRuntime();
  const tools = modelSupportsTools
    ? buildStudyTools(
        {
          subjectId: chatCtx.subjectId,
          categoryId: chatCtx.categoryId,
          itemId: chatCtx.itemId,
          skills: sortedSkills,
          academicYear: chatCtx.academicYear,
          modelId: selectedModelId,
          editingUserNote,
          userNotes,
          flashcards,
          userId,
          classContext: noteWindowAgent ? undefined : classContext,
          artifactUnsupportedReason: isImageMode
            ? "当前生图模型不支持 HTML 交互组件生成，请切换文本模型后重试。"
            : undefined,
        },
        runtime,
        {
          enableSearch: options.enableSearch ?? false,
          kitSoloAccessToken: isImageMode ? undefined : input.kitSoloAccessToken,
          connectorOwner: isImageMode ? undefined : input.connectorOwner,
          disabled: disabledTools,
          artifacts,
          memoryCommit,
          editingUserNote,
          noteWindowAgent,
          planMode,
          forcedToolName: planMode ? undefined : resolveForcedToolName(forcedTool, { editingUserNote, memoryCommit }),
        },
      )
    : {};

  const toolNames = Object.keys(tools);
  const forcedToolName = planMode
    ? undefined
    : resolveForcedToolName(forcedTool, { editingUserNote, memoryCommit });

  // 每步动态收窄工具：生图模式首步只留 generateImage 并强制调用，之后关闭工具让模型写说明文字
  // （避免强制 toolChoice 在每步重复触发）；imageSearch 配额耗尽后不再暴露。
  // 输入框指定工具：首步强制调用，其它工具仍可见。
  const prepareStep: PrepareStepFunction<ToolSet> = ({ stepNumber }) => {
    if (textOnly) return { activeTools: [], toolChoice: "none" };
    if (toolNames.length === 0) return {};
    if (isImageMode && toolNames.includes("generateImage")) {
      return stepNumber === 0
        ? { activeTools: ["generateImage"], toolChoice: { type: "tool", toolName: "generateImage" } }
        : { activeTools: [], toolChoice: "none" };
    }
    if (forcedToolName && toolNames.includes(forcedToolName) && stepNumber === 0) {
      return { toolChoice: { type: "tool", toolName: forcedToolName } };
    }
    if (runtime.imageSearchFetchedCount >= IMAGE_SEARCH_MAX_TOTAL && toolNames.includes("imageSearch")) {
      return { activeTools: toolNames.filter((n) => n !== "imageSearch") };
    }
    return {};
  };

  const lifecycle = createAgentLifecycleHooks({ metadataOnly: !!input.connectorOwner });
  const observedModel = wrapLanguageModel({
    model,
    middleware: lifecycle.modelMiddleware,
  });

  const thinkingActive = !textOnly && !!thinking.providerOptions;
  // 用户设了上限就按用户的（思考方言要求的最小值只能再抬高它）；没设就不下发，
  // 由计费层按落地模型的注册表最大输出补齐——failover 换模型时各跳各用自己的上限。
  const userCap = normalizeUserMaxOutputTokens(userMaxOutputTokens);
  const thinkingFloor = thinkingActive ? thinking.maxOutputTokens : undefined;
  const maxOutputTokens = userCap != null
    ? Math.max(userCap, thinkingFloor ?? 0)
    : thinkingFloor;

  const agent = new ToolLoopAgent<never, ToolSet>({
    id: "study-tutor",
    model: observedModel,
    instructions,
    tools,
    stopWhen: isStepCount(textOnly ? 1 : toolRoundLimit),
    // Endpoint fallback is owned by the model adapter; never repeat the entire
    // failed chain three times (especially for local permission/network errors).
    maxRetries: 0,
    temperature: input.temperature ?? 0.6,
    prepareStep,
    onStepStart: lifecycle.onStepStart,
    onStepEnd: lifecycle.onStepEnd,
    onToolExecutionStart: lifecycle.onToolExecutionStart,
    onToolExecutionEnd: lifecycle.onToolExecutionEnd,
    telemetry: lifecycle.telemetry,
    ...(thinkingActive ? { providerOptions: thinking.providerOptions } : {}),
    ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
  });

  return {
    agent,
    promptParts: { baseSystemPrompt, globalContext, skillsMenuText, pinnedSkillsText, volatile, instructions },
    tools,
    runtime,
  };
}
