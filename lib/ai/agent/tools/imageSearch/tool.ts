import { tool } from "ai";
import { z } from "zod";
import {
  IMAGE_SEARCH_UNCONFIGURED_TEXT,
  searchImages,
  trackPhotoDownload,
} from "@/lib/ai/images/imageSearch";
import type { ImageSearchOutput } from "@/lib/ai/agent/tools/imageSearch/types";
import {
  IMAGE_SEARCH_MAX_TOTAL,
  dedupeByContextKey,
  normalizeContextKeyPart,
  toText,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";

/** 测试可替换 searchImages，避免打真实 Unsplash。 */
export const imageSearchIo = { searchImages, trackPhotoDownload };

export function createImageSearchTool(runtime: StudyToolRuntime) {
  return tool({
    description:
      "搜索互联网图片并返回可嵌入的图片链接。当讲解需要配图（如物理实验装置、化学分子结构、生物组织图等）时调用。返回结果包含图片 URL，可直接以 Markdown 图片语法嵌入回复。【重要限制】单次请求（本次回答）中所有 imageSearch 调用合计最多抓取 20 张图片，下一轮提问会重新计数；每次调用 numResults 建议不超过 4；若系统提示已达到限额，禁止再次调用 imageSearch。请在第一次调用时就使用精准关键词，避免因结果不满意而反复重复调用。",
    inputSchema: z.object({
      query: z.string().describe("图片搜索关键词，如 '高斯面示意图'"),
      numResults: z.number().optional().describe("返回图片数量，默认 3，最大 4"),
    }),
    execute: async ({ query, numResults }): Promise<ImageSearchOutput> => {
      const already = runtime.imageSearchFetchedCount;
      if (already >= IMAGE_SEARCH_MAX_TOTAL) {
        return {
          text: `【图片搜索已达本次回答上限 ${IMAGE_SEARCH_MAX_TOTAL} 张，不再抓取新图片】请直接基于已有图片继续讲解。`,
          sources: [],
          provider: "unsplash",
          limitReached: true,
        };
      }
      const remaining = IMAGE_SEARCH_MAX_TOTAL - already;
      const requested = Math.min(Math.max(Number(numResults) || 3, 1), 4);
      const response = await imageSearchIo.searchImages(query, Math.min(requested, remaining));
      if (!response.configured) {
        runtime.imageSearchFetchedCount = IMAGE_SEARCH_MAX_TOTAL;
        return {
          text: IMAGE_SEARCH_UNCONFIGURED_TEXT,
          sources: [],
          provider: "unsplash",
          unconfigured: true,
        };
      }
      const results = response.results;
      if (!results.length) {
        return { text: `未找到「${query}」的相关图片。`, sources: [], provider: "unsplash" };
      }
      runtime.imageSearchFetchedCount += results.length;
      const text = results
        .map((r, i) => `[${i + 1}] ${r.alt}\n![${r.alt}](${r.url})\nPhoto by [${r.author}](${r.source}) on [Unsplash](https://unsplash.com)`)
        .join("\n\n");
      const quota = `（本次回答已累计抓取 ${runtime.imageSearchFetchedCount}/${IMAGE_SEARCH_MAX_TOTAL} 张）`;
      for (const r of results) imageSearchIo.trackPhotoDownload(r.downloadLocation);
      return dedupeByContextKey<ImageSearchOutput>(runtime, "imageSearch", {
        text: `${text}\n\n${quota}`,
        contextKey: `image:${normalizeContextKeyPart(query)}`,
        sources: results.map((r) => ({
          title: r.alt || r.author,
          url: r.url,
          snippet: "",
          media: r.thumbnail,
          alt: r.alt,
          author: r.author,
          authorUrl: r.source,
        })),
        provider: "unsplash",
      });
    },
    toModelOutput: ({ output }) => toText(output),
  });
}
