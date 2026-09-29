import type { StudyToolName } from "@/lib/ai/agent/tools/names";
import { STUDY_TOOL_NAMES } from "@/lib/ai/agent/tools/names";
import type { ToolPresentation } from "@/lib/ai/agent/tools/registry";
import type { I18nKey } from "@/lib/i18n";
import { presentation as getCurrentPage } from "@/lib/ai/agent/tools/getCurrentPage/presentation";
import { presentation as getOutline } from "@/lib/ai/agent/tools/getOutline/presentation";
import { presentation as getSection } from "@/lib/ai/agent/tools/getSection/presentation";
import { presentation as searchNotes } from "@/lib/ai/agent/tools/searchNotes/presentation";
import { presentation as searchFlashcards } from "@/lib/ai/agent/tools/searchFlashcards/presentation";
import { presentation as searchNoteImages } from "@/lib/ai/agent/tools/searchNoteImages/presentation";
import { presentation as webSearch } from "@/lib/ai/agent/tools/webSearch/presentation";
import { presentation as imageSearch } from "@/lib/ai/agent/tools/imageSearch/presentation";
import { presentation as renderInteractive } from "@/lib/ai/agent/tools/renderInteractive/presentation";
import { presentation as drawDiagram } from "@/lib/ai/agent/tools/drawDiagram/presentation";
import { presentation as generateImage } from "@/lib/ai/agent/tools/generateImage/presentation";
import { presentation as createQuiz } from "@/lib/ai/agent/tools/createQuiz/presentation";
import { presentation as writeDocument } from "@/lib/ai/agent/tools/writeDocument/presentation";
import { presentation as getArtifact } from "@/lib/ai/agent/tools/getArtifact/presentation";
import { presentation as useSkill } from "@/lib/ai/agent/tools/useSkill/presentation";
import { presentation as proposeMemory } from "@/lib/ai/agent/tools/proposeMemory/presentation";
import { presentation as commitNotes } from "@/lib/ai/agent/tools/commitNotes/presentation";
import { presentation as commitFlashcards } from "@/lib/ai/agent/tools/commitFlashcards/presentation";
import { presentation as updateUserNote } from "@/lib/ai/agent/tools/updateUserNote/presentation";
import { presentation as getProjectFiles } from "@/lib/ai/agent/tools/getProjectFiles/presentation";
import { presentation as readProjectSlices } from "@/lib/ai/agent/tools/readProjectSlices/presentation";
import { presentation as searchClassTranscript } from "@/lib/ai/agent/tools/searchClassTranscript/presentation";

export const TOOL_PRESENTATION: Record<StudyToolName, ToolPresentation> = {
  getCurrentPage,
  getOutline,
  getSection,
  searchNotes,
  searchFlashcards,
  searchNoteImages,
  webSearch,
  imageSearch,
  renderInteractive,
  drawDiagram,
  generateImage,
  createQuiz,
  writeDocument,
  getArtifact,
  useSkill,
  proposeMemory,
  commitNotes,
  commitFlashcards,
  updateUserNote,
  getProjectFiles,
  readProjectSlices,
  searchClassTranscript,
};

/**
 * 设置面板「工具调用」区展示的工具，按 STUDY_TOOL_NAMES 顺序。
 * 只给 key：设置面板自己 t() 取词，换语言不用重建这张表。
 */
export const TOGGLEABLE_TOOLS: readonly { name: StudyToolName; labelKey: I18nKey; descriptionKey: I18nKey }[] = STUDY_TOOL_NAMES
  .filter((name) => TOOL_PRESENTATION[name].toggleable)
  .map((name) => ({
    name,
    labelKey: TOOL_PRESENTATION[name].settingsLabelKey,
    descriptionKey: TOOL_PRESENTATION[name].descriptionKey,
  }));

export function getToolPresentation(name: string): ToolPresentation | undefined {
  return (TOOL_PRESENTATION as Record<string, ToolPresentation | undefined>)[name];
}
