import type { SourceRound } from "@/lib/chat/sources/traceSources";

/**
 * 检索轮次的分组文案 key。
 *
 * **单一真相源**：轮次标题直接用工具自己的展示名（`trace.tool.<tool>.label`）—— 也就是思考链里
 * 那张工具卡片显示的同一句话。历史上这里另立过一套 `agent.sources.round.*`
 * （「联网搜索 / 笔记检索 / 图片检索」），跟工具卡片口径（「搜索网页 / 检索笔记 / 检索笔记图片」）
 * 并存，同一批检索在两个地方叫两个名字；2026-09 已收敛掉，**不要再引入第二套措辞**。
 *
 * `SourceRound.label` 字段仍然保留：面板支持调用方显式覆盖（`SourceTraceViewer` 优先读它），
 * 但常规调用方不必再贴一遍 —— 兜底值本来就是同一个 key。
 */
const ROUND_LABEL_KEY: Record<SourceRound["tool"], string> = {
  searchNotes: "trace.tool.searchNotes.label",
  searchNoteImages: "trace.tool.searchNoteImages.label",
  imageSearch: "trace.tool.imageSearch.label",
  webSearch: "trace.tool.webSearch.label",
  getSection: "trace.tool.getSection.label",
  getCurrentPage: "trace.tool.getCurrentPage.label",
};

export function sourceRoundLabelKey(tool: SourceRound["tool"]): string {
  return ROUND_LABEL_KEY[tool];
}
