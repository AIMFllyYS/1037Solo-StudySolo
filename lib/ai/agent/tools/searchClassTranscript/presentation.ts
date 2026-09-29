import type { ToolPresentation } from "@/lib/ai/agent/tools/registry";

export const presentation: ToolPresentation = {
  labelKey: "trace.tool.searchClassTranscript.label",
  settingsLabelKey: "trace.tool.searchClassTranscript.settingsLabel",
  descriptionKey: "trace.tool.searchClassTranscript.description",
  icon: "search",
  // 只在 Class 模式随课堂上下文出现，不进设置页的工具开关。
  toggleable: false,
};
