import { z } from "zod";

import type { CustomApiGroup, CustomModelConfig } from "@/lib/ai/models";

import { REQUEST_LIMITS } from "./limits";
function filePartPayloadLength(part: Record<string, unknown>): number {
  const url = typeof part.url === "string" ? part.url : "";
  const data = typeof part.data === "string" ? part.data : "";
  return Math.max(url.length, data.length);
}

export const skillSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    content: z.string().max(REQUEST_LIMITS.skillContentChars).optional(),
    pinned: z.boolean().optional(),
    createdAt: z.number().optional(),
    sourceId: z.string().max(128).optional(),
    sourceVersion: z.string().max(64).optional(),
  })
  .transform((s) => ({
    id: String(s.id ?? ""),
    name: String(s.name ?? "").trim(),
    description: String(s.description ?? ""),
    content: String(s.content ?? ""),
    pinned: s.pinned === true,
    createdAt: Number(s.createdAt ?? 0),
    sourceId: s.sourceId,
    sourceVersion: s.sourceVersion,
  }));

/** 客户端 UIMessage（只校验最外层，parts 由 convertToModelMessages 再做严格校验）。 */
export const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant"], "不支持的消息角色，仅允许 user 或 assistant。"),
    parts: z
      .array(z.looseObject({ type: z.string() }))
      .max(REQUEST_LIMITS.parts, `单条消息的内容块超过上限（最多 ${REQUEST_LIMITS.parts} 个）。`),
    metadata: z.unknown().optional(),
  })
  .superRefine((message, ctx) => {
    if (message.parts.filter(part => part.type === 'file').length > 9) ctx.addIssue({ code: 'custom', message: '单次消息最多 9 个附件，发送后可以继续添加。' });
    for (const part of message.parts) {
      if (part.type === "file") {
        if (filePartPayloadLength(part) <= REQUEST_LIMITS.filePartChars) continue;
        ctx.addIssue({
          code: "custom",
          message: `附件过大（单张不超过 ${Math.round(REQUEST_LIMITS.filePartChars / 1024)}KB）。`,
        });
        break;
      }
      if (part.type === "text" && typeof part.text === "string" && part.text.length > REQUEST_LIMITS.textPartChars) {
        ctx.addIssue({
          code: "custom",
          message: `文本内容过长（单段不超过 ${Math.round(REQUEST_LIMITS.textPartChars / 1024)}KB）。`,
        });
        break;
      }
    }
  });

/** 自定义模型配置字段较多且多为可选高级项：只校验 id，其余字段透传（由 models.ts 消费时再判定）。 */
const customModelSchema = z
  .looseObject({ id: z.string() })
  .transform((m) => m as unknown as CustomModelConfig);

export const customApiGroupSchema: z.ZodType<CustomApiGroup, unknown> = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  models: z.array(customModelSchema),
  timeoutMs: z.number().finite().positive().max(600_000).optional(),
});

export const customProviderSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

/** 卫星路由：缺省或非数组回退 []（与原先 Array.isArray 手判一致）；数组元素仍校验。 */
export const satelliteApiGroupsSchema = z
  .unknown()
  .transform((value) => (Array.isArray(value) ? value : []))
  .pipe(
    z
      .array(customApiGroupSchema)
      .max(REQUEST_LIMITS.customApiGroups, `自定义 API 分组超过上限（最多 ${REQUEST_LIMITS.customApiGroups} 个）。`),
  )
  .optional()
  .default([]);

export const finiteNumber = z.number().refine((n) => Number.isFinite(n));