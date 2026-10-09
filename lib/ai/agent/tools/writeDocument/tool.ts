import { tool } from "ai";
import { validateDocumentSpec, documentSpecSchema } from "@/lib/ai/agent/documentTool";
import type { WriteDocumentInput, WriteDocumentOutput } from "@/lib/ai/agent/tools/writeDocument/types";
import { toText, type StudyToolContext } from "@/lib/ai/agent/tools/_shared";

export function createWriteDocumentTool(ctx: StudyToolContext) {
  // 原理（给维护者）：这个工具本身不写文章，只校验参数并下发「文档任务卡片」；
  // 前端随后独立请求 /api/document，**分多次调用 AI**（先大纲，再逐节生成并拼接）。
  // 因此那些写作调用拿不到本轮对话/教材上下文，调用本工具时传参（brief / outline / references）必须足够详细。
  return tool({
    description:
      "撰写长文章、论文、报告或复习讲义。调用后前端会展示文档生成卡片并分节流式生成；当前仅支持导出 Markdown。用于需要一次性产出较长、结构化文档的场景（如课程论文、章节总结、实验报告）。" +
      "【原理】本工具通过多次调用 AI 实现：先出大纲，再逐节生成并拼接；负责写作的 AI 看不到当前对话与教材上下文，只能依据本次传入的参数，所以 brief / outline / references 必须写得非常详细（主题、读者、论点、风格、必须覆盖的知识点，并把已检索到的要点与引用原文直接贴进 references）。" +
      "【导出】需要把结果导出为文件、合并或校验时，如果 cloudSandbox 可用，请直接调用它完成，无需先征求同意。",
    inputSchema: documentSpecSchema,
    execute: async (input, { toolCallId }): Promise<WriteDocumentOutput> => {
      const validated = validateDocumentSpec(input);
      const spec = validated.ok ? validated.spec : (input as WriteDocumentInput);
      if (!validated.ok) {
        return {
          text: `文档参数校验未通过：${validated.error}。请修正后重新调用 writeDocument。`,
          documentId: `doc_${toolCallId}`,
          spec,
          unsupportedReason: validated.error,
        };
      }
      return {
        text: `长文档「${spec.title}」已生成任务卡片，将在前端分节生成。请用一句话说明这篇文档将帮助学生做什么，然后继续你的讲解。`,
        documentId: `doc_${toolCallId}`,
        spec,
        modelId: ctx.modelId,
      };
    },
    toModelOutput: ({ output }) => toText(output),
  });
}
