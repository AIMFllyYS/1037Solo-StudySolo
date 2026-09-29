/**
 * Agent 工具注册表的同构入口。
 * 只导出类型与展示元数据；客户端渲染层在 `components/chat/toolCards/`。
 * 不要从这里 re-export tool.ts / server.ts。
 */

/** @public 各工具 Input/Output 与 StudyTools 联合，兼容旧 import。 */
export type { TextToolOutput } from "@/lib/ai/agent/tools/_types";
export type { GetCurrentPageInput, GetCurrentPageOutput } from "@/lib/ai/agent/tools/getCurrentPage/types";
export type { GetOutlineInput, GetOutlineOutput } from "@/lib/ai/agent/tools/getOutline/types";
export type { GetSectionInput, GetSectionOutput } from "@/lib/ai/agent/tools/getSection/types";
export type { SearchHit, SearchHitKind, SearchNotesDiagnostics, SearchNotesInput, SearchNotesOutput, SearchNotesScope } from "@/lib/ai/agent/tools/searchNotes/types";
export type { FlashcardHit, SearchFlashcardsInput, SearchFlashcardsOutput } from "@/lib/ai/agent/tools/searchFlashcards/types";
export type { NoteImageHit, SearchNoteImagesInput, SearchNoteImagesOutput } from "@/lib/ai/agent/tools/searchNoteImages/types";
export type { WebSearchInput, WebSearchOutput } from "@/lib/ai/agent/tools/webSearch/types";
export type { ImageSearchInput, ImageSearchOutput } from "@/lib/ai/agent/tools/imageSearch/types";
export type { RenderInteractiveInput, RenderInteractiveOutput } from "@/lib/ai/agent/tools/renderInteractive/types";
export type { DrawDiagramInput, DrawDiagramOutput } from "@/lib/ai/agent/tools/drawDiagram/types";
export type { GenerateImageInput, GenerateImageOutput } from "@/lib/ai/agent/tools/generateImage/types";
export type { CreateQuizInput, CreateQuizOutput, CreateQuizQuestionInput } from "@/lib/ai/agent/tools/createQuiz/types";
export type { WriteDocumentInput, WriteDocumentOutput } from "@/lib/ai/agent/tools/writeDocument/types";
export type { GetArtifactInput, GetArtifactOutput, ArtifactCatalogItem } from "@/lib/ai/agent/tools/getArtifact/types";
export type { UseSkillInput, UseSkillOutput } from "@/lib/ai/agent/tools/useSkill/types";
export type { ProposeMemoryInput, ProposeMemoryOutput, MemoryKind } from "@/lib/ai/agent/tools/proposeMemory/types";
export type { CommitNotesInput, CommitNotesOutput } from "@/lib/ai/agent/tools/commitNotes/types";
export type { CommitFlashcardsInput, CommitFlashcardsOutput, CommitFlashcardItem } from "@/lib/ai/agent/tools/commitFlashcards/types";
export type { UpdateUserNoteAction, UpdateUserNoteInput, UpdateUserNoteOutput } from "@/lib/ai/agent/tools/updateUserNote/types";
export type { StudyTools, StudyToolName } from "@/lib/ai/agent/tools/names";
export type { ClassTranscriptHit, SearchClassTranscriptInput, SearchClassTranscriptOutput } from "@/lib/ai/agent/tools/searchClassTranscript/types";
/** @public 兼容旧 import 路径；设置面板与思考链从 presentations / toolPresentation 取用。 */
export { STUDY_TOOL_NAMES } from "@/lib/ai/agent/tools/names";
/** @public 注册表与结果卡片的客户端类型。 */
export type {
  ResultCardContext,
  ResultCardProps,
  ToolIconKind,
  ToolModule,
  ToolPart,
  ToolPresentation,
} from "@/lib/ai/agent/tools/registry";
/** @public 客户端展示契约入口；ChatSettings / ToolTraceStep 仍走 toolPresentation 兼容层。 */
export { TOOL_PRESENTATION, TOGGLEABLE_TOOLS, getToolPresentation } from "@/lib/ai/agent/tools/presentations";
