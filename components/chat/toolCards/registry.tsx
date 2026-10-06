import type { ComponentType } from "react";
import type { StudyToolName } from "@/lib/ai/agent/tools/names";
import type { NoteImageHit, SearchHit } from "@/lib/ai/agent/toolTypes";
import type { ResultCardProps, ToolModule, ToolPart, ToolPresentation } from "@/lib/ai/agent/tools/registry";
import { TOOL_PRESENTATION } from "@/lib/ai/agent/tools/presentations";
import { noteImageItemKey, noteItemKey, webItemKey } from "@/lib/chat/traceSources";
import type { WebSearchSource } from "@/lib/types/chat";
import SearchNotesResultCard from "@/components/chat/toolCards/searchNotesCard";
import WebSearchResultCard from "@/components/chat/toolCards/webSearchCard";
import RenderInteractiveResultCard from "@/components/chat/toolCards/renderInteractiveCard";
import GenerateImageResultCard from "@/components/chat/toolCards/generateImageCard";
import CreateQuizResultCard from "@/components/chat/toolCards/createQuizCard";
import SearchNoteImagesResultCard from "@/components/chat/toolCards/searchNoteImagesCard";
import WriteDocumentResultCard from "@/components/chat/toolCards/writeDocumentCard";
import ImageSearchResultCard from "@/components/chat/toolCards/imageSearchCard";
import NoteChangeConsentCard from "@/components/notes/NoteChangeConsentCard";
import KitSoloCard from "@/components/chat/toolCards/kitSoloCard";
import LearningConnectorsCard from "@/components/chat/toolCards/learningConnectorsCard";
import CloudSandboxCard from "@/components/chat/toolCards/cloudSandboxCard";

function moduleOf<N extends StudyToolName>(
  name: N,
  extras: Omit<ToolModule<N>, "name" | "presentation"> = {},
): ToolModule<N> {
  return { name, presentation: TOOL_PRESENTATION[name], ...extras };
}

export const TOOL_REGISTRY = {
  cloudSandbox: moduleOf("cloudSandbox", { StepDetail: CloudSandboxCard }),
  learningConnectors: moduleOf("learningConnectors", { StepDetail: LearningConnectorsCard }),
  kitSolo: moduleOf("kitSolo", { StepDetail: KitSoloCard }),
  getCurrentPage: moduleOf("getCurrentPage"),
  getOutline: moduleOf("getOutline"),
  getSection: moduleOf("getSection"),
  searchNotes: moduleOf("searchNotes", {
    ResultCard: SearchNotesResultCard,
    hideInAgentChat: true,
    shouldRender: (part) => part.state === "output-available" && !!part.output.hits?.length,
    aggregate: true,
    itemKey: (item) => noteItemKey(item as SearchHit),
    itemsOf: (part) => (part.state === "output-available" ? part.output.hits ?? [] : []),
    withItems: (part, items) =>
      part.state === "output-available" ? { ...part, output: { ...part.output, hits: items as SearchHit[] } } : part,
  }),
  searchFlashcards: moduleOf("searchFlashcards"),
  searchNoteImages: moduleOf("searchNoteImages", {
    ResultCard: SearchNoteImagesResultCard,
    hideInAgentChat: true,
    shouldRender: (part) => part.state === "output-available" && !!part.output.images?.length,
    aggregate: true,
    itemKey: (item) => noteImageItemKey(item as NoteImageHit),
    itemsOf: (part) => (part.state === "output-available" ? part.output.images ?? [] : []),
    withItems: (part, items) =>
      part.state === "output-available" ? { ...part, output: { ...part.output, images: items as NoteImageHit[] } } : part,
  }),
  webSearch: moduleOf("webSearch", {
    ResultCard: WebSearchResultCard,
    hideInAgentChat: true,
    // 搜索进行中就挂出 live 卡：供应商脉冲点 + 骨架来源卡，来源流到了直接换真卡。
    liveWhileRunning: true,
    shouldRender: (part) => part.state === "output-available" && !!part.output.sources?.length,
    aggregate: true,
    itemKey: (item) => webItemKey(item as WebSearchSource),
    itemsOf: (part) => (part.state === "output-available" ? part.output.sources ?? [] : []),
    withItems: (part, items) =>
      part.state === "output-available" ? { ...part, output: { ...part.output, sources: items as WebSearchSource[] } } : part,
  }),
  imageSearch: moduleOf("imageSearch", {
    ResultCard: ImageSearchResultCard,
    hideInAgentChat: true,
    shouldRender: (part) => part.state === "output-available" && !!part.output.sources?.length,
    aggregate: true,
    itemKey: (item) => webItemKey(item as WebSearchSource),
    itemsOf: (part) => (part.state === "output-available" ? part.output.sources ?? [] : []),
    withItems: (part, items) =>
      part.state === "output-available" ? { ...part, output: { ...part.output, sources: items as WebSearchSource[] } } : part,
  }),
  renderInteractive: moduleOf("renderInteractive", {
    ResultCard: RenderInteractiveResultCard,
    resultKey: (part) => (part.state === "output-available" ? part.output.artifactId : null),
  }),
  drawDiagram: moduleOf("drawDiagram"),
  generateImage: moduleOf("generateImage", {
    ResultCard: GenerateImageResultCard,
    resultKey: (part) => (part.state === "output-available" ? part.output.imageGenId : null),
  }),
  createQuiz: moduleOf("createQuiz", {
    ResultCard: CreateQuizResultCard,
    shouldRender: (part) => part.state === "output-available" && !!part.output.questions?.length,
    resultKey: (part) => (part.state === "output-available" ? part.output.quizId : null),
  }),
  writeDocument: moduleOf("writeDocument", {
    ResultCard: WriteDocumentResultCard,
    resultKey: (part) => (part.state === "output-available" ? part.output.documentId : null),
  }),
  getArtifact: moduleOf("getArtifact"),
  useSkill: moduleOf("useSkill"),
  // 记忆闭环：只在 Agent 轨迹里显示调用，不进对话产出框。
  proposeMemory: moduleOf("proposeMemory"),
  commitNotes: moduleOf("commitNotes"),
  commitFlashcards: moduleOf("commitFlashcards"),
  // 笔记变更必须由用户点「同意修改 / 确认删除」才落盘，所以它需要一张结果卡（不再是静默工具）。
  updateUserNote: moduleOf("updateUserNote", {
    ResultCard: NoteChangeConsentCard,
    resultKey: (part) => (part.state === "output-available" ? part.output.proposalId : null),
  }),
  // 项目文件：索引与切片都只进模型上下文，对话里不出现卡片（同 getSection）。
  getProjectFiles: moduleOf("getProjectFiles"),
  readProjectSlices: moduleOf("readProjectSlices"),
  searchClassTranscript: moduleOf("searchClassTranscript"),
} satisfies { [N in StudyToolName]: ToolModule<N> };

export const THREAD_SILENT_TOOLS = ["proposeMemory", "commitNotes", "commitFlashcards"] as const satisfies readonly StudyToolName[];

/** 现网 ChatMessage 卡片顺序（不是 STUDY_TOOL_NAMES）。imageSearch 追加在末尾，与收回前的气泡顺序一致。 */
export const RESULT_CARD_ORDER = [
  "searchNotes",
  "webSearch",
  "renderInteractive",
  "generateImage",
  "createQuiz",
  "searchNoteImages",
  "writeDocument",
  "imageSearch",
  "updateUserNote",
] as const satisfies readonly StudyToolName[];

export interface ToolResultCardEntry {
  name: StudyToolName;
  presentation: ToolPresentation;
  ResultCard: ComponentType<ResultCardProps>;
  resultKey?: (part: ToolPart<StudyToolName>) => string | null;
  shouldRender?: (part: ToolPart<StudyToolName>) => boolean;
  hideInAgentChat?: boolean;
  liveWhileRunning?: boolean;
  aggregate?: boolean;
  itemKey?: (item: unknown) => string | null;
  itemsOf?: (part: ToolPart<StudyToolName>) => readonly unknown[];
  withItems?: (part: ToolPart<StudyToolName>, items: readonly unknown[]) => ToolPart<StudyToolName>;
}

export const TOOL_RESULT_CARDS: readonly ToolResultCardEntry[] = RESULT_CARD_ORDER.filter(
  (name) => !(THREAD_SILENT_TOOLS as readonly StudyToolName[]).includes(name),
).map((name) => {
  const mod = TOOL_REGISTRY[name];
  if (!mod.ResultCard) throw new Error(`TOOL_RESULT_CARDS: ${name} 缺少 ResultCard`);
  return {
    name,
    presentation: mod.presentation,
    ResultCard: mod.ResultCard as ComponentType<ResultCardProps>,
    resultKey: mod.resultKey as ToolResultCardEntry["resultKey"],
    shouldRender: mod.shouldRender as ToolResultCardEntry["shouldRender"],
    hideInAgentChat: mod.hideInAgentChat,
    liveWhileRunning: mod.liveWhileRunning,
    aggregate: mod.aggregate,
    itemKey: mod.itemKey,
    itemsOf: mod.itemsOf as ToolResultCardEntry["itemsOf"],
    withItems: mod.withItems as ToolResultCardEntry["withItems"],
  };
});
