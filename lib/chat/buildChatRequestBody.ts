import { isCustomRegistryId, selectCustomApiGroupsForRequest, type CustomApiGroup } from "@/lib/ai/models";
import {
  EMPTY_CAPABILITY_ENDPOINTS,
  capabilityNeedsForChat,
  selectCapabilityEndpointsForRequest,
  type CapabilityEndpoints,
} from "@/lib/ai/capabilityEndpoints";
import type { ChatContext } from "@/lib/types/chat";
import type { Skill } from "@/lib/types/skill";
import type { ContextBudget } from "./estimateContextBudget";
import type { ResolvedRequestSettings } from "./resolveRequestSettings";
import type { ArtifactCatalogItem } from "@/lib/context/compactArtifacts";
import type { MemoryCommitKind } from "@/lib/memory/memoryLoop";
import type { EditingUserNoteContext } from "@/lib/notes/editingUserNote";
import type { FlashcardCatalogItem, UserNoteCatalogItem } from "@/lib/ai/agent/tools/memoryCatalog";
import type { AttachedFileRef, ComposerForcedTool } from "@/lib/chat/composerIntent";
import type { ClassAgentContext } from "@/lib/class/agentContext";
import type {
  ProjectFileCatalogItem,
  ProjectSlicePayload,
} from "@/lib/ai/agent/tools/projectFiles/types";

export interface ChatRequestBodySettings {
  customApiGroups: CustomApiGroup[];
  customBaseUrl: string;
  customApiKey: string;
  customModelId: string;
  defaultImageModelId: string | null;
  imageModeTextModel: string;
  imageModeTextModelFallback: string;
  capabilityEndpoints?: CapabilityEndpoints;
  disabledTools: string[];
  globalContext: string;
  memoryCommit?: MemoryCommitKind;
  editingUserNote?: EditingUserNoteContext;
  noteWindowAgent?: boolean;
  userNotes?: UserNoteCatalogItem[];
  flashcards?: FlashcardCatalogItem[];
  /** 项目文件目录（索引）与本轮携带的切片正文；没有项目时为 undefined。 */
  projectFiles?: ProjectFileCatalogItem[];
  projectSlices?: ProjectSlicePayload[];
  maxToolRounds?: number;
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
  classContext?: ClassAgentContext;
}

/** 发给 /api/chat 的 body（messages 由 transport 另传）。字段须与 chatRequestSchema 对齐。 */
export interface ChatRequestBody {
  modelId: string;
  customApiGroups: CustomApiGroup[];
  customProvider?: { baseUrl: string; apiKey: string; model: string };
  defaultImageModelId: string | null;
  imageModeTextModel: string;
  imageModeTextModelFallback: string;
  capabilityEndpoints: CapabilityEndpoints;
  disabledTools: string[];
  subjectId: string;
  categoryId: string;
  itemId: string;
  currentTopic: string;
  academicYear: string;
  enableThinking: boolean;
  thinkingEffort: ResolvedRequestSettings["thinkingEffort"];
  enableSearch: boolean | undefined;
  contextMode: ResolvedRequestSettings["contextMode"];
  contextTruncated: boolean;
  sessionContextBudgetTokens: number;
  clientContextTokens: number;
  globalContext: string;
  skills: Skill[];
  artifacts?: ArtifactCatalogItem[];
  memoryCommit?: MemoryCommitKind;
  editingUserNote?: EditingUserNoteContext;
  noteWindowAgent?: boolean;
  userNotes?: UserNoteCatalogItem[];
  flashcards?: FlashcardCatalogItem[];
  projectFiles?: ProjectFileCatalogItem[];
  projectSlices?: ProjectSlicePayload[];
  maxToolRounds?: number;
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
  classContext?: ClassAgentContext;
}

export function buildChatRequestBody(
  ctx: ChatContext,
  settings: ChatRequestBodySettings,
  resolved: ResolvedRequestSettings,
  budget: ContextBudget,
  skills: Skill[],
  academicYear: string,
  artifacts: ArtifactCatalogItem[] = [],
): ChatRequestBody {
  const customApiGroups = selectCustomApiGroupsForRequest(
    settings.customApiGroups,
    resolved.effectiveModelId,
  );
  const customProvider: ChatRequestBody["customProvider"] =
    customApiGroups.length === 0
    && isCustomRegistryId(resolved.effectiveModelId)
    && settings.customBaseUrl
      ? { baseUrl: settings.customBaseUrl, apiKey: settings.customApiKey, model: settings.customModelId }
      : undefined;
  return {
    modelId: resolved.effectiveModelId,
    customApiGroups,
    customProvider,
    defaultImageModelId: settings.defaultImageModelId,
    imageModeTextModel: settings.imageModeTextModel,
    imageModeTextModelFallback: settings.imageModeTextModelFallback,
    capabilityEndpoints: selectCapabilityEndpointsForRequest(
      settings.capabilityEndpoints ?? EMPTY_CAPABILITY_ENDPOINTS,
      capabilityNeedsForChat({
        enableSearch: resolved.enableSearch,
        disabledTools: settings.disabledTools,
        contextMode: resolved.contextMode,
      }),
    ),
    disabledTools: settings.disabledTools,
    subjectId: ctx.subjectId,
    categoryId: ctx.categoryId,
    itemId: ctx.itemId,
    currentTopic: ctx.currentTopic,
    academicYear,
    enableThinking: resolved.enableThinking,
    thinkingEffort: resolved.thinkingEffort,
    enableSearch: resolved.enableSearch,
    contextMode: resolved.contextMode,
    contextTruncated: budget.softLimitReached,
    sessionContextBudgetTokens: budget.limit,
    clientContextTokens: budget.estimated,
    globalContext: settings.globalContext,
    skills,
    artifacts,
    memoryCommit: settings.memoryCommit,
    editingUserNote: settings.editingUserNote,
    noteWindowAgent: settings.noteWindowAgent,
    userNotes: settings.userNotes ?? [],
    flashcards: settings.flashcards ?? [],
    projectFiles: settings.projectFiles ?? [],
    projectSlices: settings.projectSlices ?? [],
    maxToolRounds: settings.maxToolRounds,
    planMode: settings.planMode,
    forcedTool: settings.forcedTool,
    attachedFiles: settings.attachedFiles ?? [],
    ...(settings.classContext ? { classContext: settings.classContext } : {}),
  };
}
