// 工具的「展示契约」兼容入口（客户端安全，无服务端依赖）。
//
// 真实定义在 `lib/ai/agent/tools/<name>/presentation.ts`，由 presentations.ts 汇总。
// 结果卡片由 registry 的 ResultCard 分发。

/** @public 兼容旧 import 路径。 */
export type { ToolIconKind, ToolPresentation } from "@/lib/ai/agent/tools/registry";
/** @public 兼容旧 import 路径；TOGGLEABLE_TOOLS / getToolPresentation 仍有调用方。 */
export { TOOL_PRESENTATION, TOGGLEABLE_TOOLS, getToolPresentation } from "@/lib/ai/agent/tools/presentations";
