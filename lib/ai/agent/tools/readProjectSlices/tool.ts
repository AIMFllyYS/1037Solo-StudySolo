import { tool } from "ai";
import { z } from "zod";
import {
  dedupeByContextKey,
  toText,
  type StudyToolContext,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";
import { PROJECT_LIMITS } from "@/lib/project/limits";
import type { ReadProjectSlicesOutput } from "@/lib/ai/agent/tools/projectFiles/types";
import { loadProcessedFile } from '@/lib/files/service.server';

/**
 * 读项目文件的切片正文。
 *
 * 只读「本轮携带」的那部分（项目不大时默认全带；项目大就只带用户在窗里勾的片）。
 * 没携带的切片不会被静默跳过——返回可执行的下一步（让用户点「带入对话」）。
 */
export function createReadProjectSlicesTool(ctx: StudyToolContext, runtime: StudyToolRuntime) {
  const files = ctx.projectFiles ?? [];
  const carried = ctx.projectSlices ?? [];
  return tool({
    description:
      "按切片读项目文件正文。先 getProjectFiles 拿 fileId 与 sliceId；也可以给 query 让工具按标题/摘要挑片。studio-ref（Studio 教材引用）不在这里读——用 getSection(path)。",
    inputSchema: z.object({
      fileId: z.string().describe("来自 getProjectFiles 的文件 id"),
      sliceIds: z.array(z.string()).max(24).optional().describe("要读的切片 id 列表"),
      query: z.string().optional().describe("或者给关键词，按切片标题 / 摘要挑选"),
      offset: z.number().int().min(0).optional().describe('云端全文的起始字符位置，用于继续读取长文件'),
    }),
    execute: async ({ fileId, sliceIds, query, offset }): Promise<ReadProjectSlicesOutput> => {
      const file = files.find((item) => item.fileId === fileId);
      if (file?.cloudFileId && ctx.userId) {
        const content = await loadProcessedFile(ctx.userId, file.cloudFileId);
        const text = content.text ?? '';
        const match = query?.trim() ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
        const start = offset ?? (match >= 0 ? Math.max(0, match - 500) : 0);
        const end = Math.min(text.length, start + 12000);
        return { found: true, sliceIds: [`offset:${start}`], text: `【${file.name}｜fileId=${fileId}｜${start}–${end}/${text.length} 字】\n${text.slice(start, end)}${end < text.length ? `\n后续仍在云端，offset=${end} 可继续读取。` : ''}`, ...(content.image ? { image: content.image } : {}) };
      }
      if (!file) {
        const available = files.map((item) => `${item.fileId}（${item.name}）`).join("、");
        return {
          text: `未找到项目文件 ${fileId}。可用：${available || "（当前对话没有带项目文件）"}。可先调用 getProjectFiles。`,
          found: false,
          sliceIds: [],
        };
      }
      if (file.kind === "studio-ref") {
        const path = file.studioRef?.path ?? "";
        return {
          text: `「${file.name}」是 Studio 教材引用（软链接），没有本地切片。请直接用 getSection(path) 读它：path="${path}"。`,
          found: false,
          sliceIds: [],
        };
      }
      const available = carried.filter((slice) => slice.fileId === fileId);
      const indexOf = new Map(file.slices.map((slice) => [slice.sliceId, slice]));
      const needle = query?.trim().toLowerCase() ?? "";
      let targets = sliceIds?.filter((id) => Boolean(id)) ?? [];
      if (targets.length === 0 && needle) {
        targets = available
          .filter((slice) => `${slice.title} ${indexOf.get(slice.sliceId)?.summary ?? ""}`.toLowerCase().includes(needle))
          .map((slice) => slice.sliceId);
      }
      if (targets.length === 0 && available.length > 0) {
        // 没指定也没搜到：给整份已携带内容（项目不大时就是全文）。
        targets = available.map((slice) => slice.sliceId);
      }
      if (targets.length === 0) {
        const indexLines = file.slices.map((slice) => `${slice.sliceId}｜${slice.title}｜${slice.chars} 字`).join("\n");
        return {
          text: `「${file.name}」这一轮没有携带任何切片正文。请让用户在项目文件窗点「带入对话」（项目较大时才会这样）。当前索引：\n${indexLines || "（没有切片）"}`,
          found: false,
          sliceIds: [],
        };
      }

      const blocks: string[] = [];
      const readIds: string[] = [];
      const missing: string[] = [];
      let used = 0;
      for (const sliceId of targets) {
        const payload = available.find((slice) => slice.sliceId === sliceId);
        if (!payload) {
          const known = indexOf.get(sliceId);
          missing.push(known ? `${sliceId}（${known.title}）` : sliceId);
          continue;
        }
        if (used + payload.text.length > PROJECT_LIMITS.MAX_CARRY_CHARS) {
          missing.push(`${sliceId}（本轮预算已满）`);
          continue;
        }
        used += payload.text.length;
        readIds.push(sliceId);
        blocks.push(`【${file.name} · ${payload.title} · ${sliceId}】\n${payload.text}`);
      }

      const header = `项目文件「${file.name}」切片 ${readIds.join("、") || "（无）"}`;
      const tail = missing.length
        ? `\n\n以下切片这一轮没有携带到上下文：${missing.join("、")}。请让用户在项目文件窗点「带入对话」，或改用其它切片。`
        : "";
      return dedupeByContextKey(runtime, "readProjectSlices", {
        text: `【${header}】\n\n${blocks.join("\n\n")}${tail}`,
        contextKey: `project-slices:${fileId}:${readIds.join(",")}`,
        found: true,
        sliceIds: readIds,
      });
    },
    toModelOutput: ({ output }) => output.image?.dataUrl ? { type: 'content' as const, value: [{ type: 'text' as const, text: output.text }, { type: 'file' as const, data: { type: 'data' as const, data: output.image.dataUrl.split(',')[1]! }, mediaType: output.image.mimeType }] } : toText(output),
  });
}
