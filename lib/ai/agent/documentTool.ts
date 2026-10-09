// writeDocument 工具的参数校验与归一化（服务端）。

import { z } from "zod";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_GENRES,
  type DocumentLanguage,
  type DocumentSpec,
} from "@/lib/documents/types";

const documentSpecSchema = z.object({
  title: z.string().min(1).describe("文章标题"),
  // 交付只有 Markdown。仍接受历史的 docx / pdf（IndexedDB 里存着旧文档），
  // 但对模型只描述 markdown，并在下面归一化——不要再让模型以为能产出 Word/PDF。
  format: z.enum(DOCUMENT_FORMATS as [string, ...string[]]).describe("目标交付格式：markdown（当前只支持 Markdown 交付）"),
  genre: z.enum(DOCUMENT_GENRES as [string, ...string[]]).describe("文体：article / paper / report / review-notes / essay"),
  brief: z.string().min(1).describe("写作要求（务必详细，写作 AI 看不到对话上下文）：主题、受众、论点、风格、必须覆盖的知识点与易错点、学生当前水平"),
  outline: z.array(z.string().min(1)).optional().describe("可选的章节标题列表（建议自己给全，并在每节标题里写清这节要写什么）；省略时由 outline 阶段生成"),
  references: z.string().optional().describe("参考材料：把你已读取/检索到的要点、定义、公式和引用原文直接贴在这里（带来源编号）；写作 AI 只能看到这里和 brief，不要写“见上文”"),
  targetWords: z.number().int().min(100).optional().describe("目标总字数（中文按字、英文按词）"),
  language: z.enum(["zh", "en"]).optional().describe("语言，默认 zh"),
});

export function validateDocumentSpec(input: unknown): { ok: true; spec: DocumentSpec } | { ok: false; error: string } {
  const parsed = documentSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("；") };
  }
  return {
    ok: true,
    spec: {
      ...parsed.data,
      // 查看器只给 .md，所以旧的 docx / pdf 一律当 markdown 处理。
      format: "markdown",
      language: (parsed.data.language ?? "zh") as DocumentLanguage,
    } as DocumentSpec,
  };
}

export { documentSpecSchema };
