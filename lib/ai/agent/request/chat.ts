import { z } from "zod";
import { localCatalogSchema } from '@/lib/local-files/contract';
import { classAgentContextSchema } from "@/lib/class/agentContext";
import { DEFAULT_ACADEMIC_YEAR, isAcademicYearId, type AcademicYearId } from "@/lib/constants/academic-year";
import { MAX_MEMORY_CARDS, MAX_MEMORY_CARD_FIELD_CHARS, MAX_MEMORY_NOTES, MAX_MEMORY_NOTE_CHARS } from "@/lib/ai/agent/tools/memoryCatalog";

import { normalizeCapabilityEndpoints } from "@/lib/ai/endpoints/capabilityEndpoints";
import { REQUEST_LIMITS } from "./limits";
import { uiMessageSchema, skillSchema, customApiGroupSchema, finiteNumber } from "./shared";
/** 客户端 body 字段见 `lib/chat/buildChatRequestBody.ts` 的 `ChatRequestBody`（messages 由 transport 另传）。 */
export const chatRequestSchema = z.object({
  cloudFileIds: z.array(z.string().uuid()).max(10000).optional().default([]),
  localFiles: localCatalogSchema.optional().default([]),
  localContinuation: z.string().max(100000).optional(),
  messages: z
    .array(uiMessageSchema)
    .max(REQUEST_LIMITS.messages, `消息数量超过上限（最多 ${REQUEST_LIMITS.messages} 条）。`)
    .default([]),
  /** DefaultChatTransport 的 chatId，用作 usage_ledger.session_id。 */
  id: z.string().optional(),
  /** Positive independent-Agent surface; execution still requires its dedicated API and server authorization. */
  agentMain: z.boolean().optional().default(false),
  modelId: z.string().optional(),
  /** 兼容旧式 model:'flash'/'pro'（如划词浮窗早期版本）。 */
  model: z.enum(["flash", "pro"]).optional(),
  customProvider: z.object({ baseUrl: z.string().optional(), apiKey: z.string().optional(), model: z.string().optional() }).optional(),
  customApiGroups: z
    .array(customApiGroupSchema)
    .max(REQUEST_LIMITS.customApiGroups, `自定义 API 分组超过上限（最多 ${REQUEST_LIMITS.customApiGroups} 个）。`)
    .default([]),
  defaultImageModelId: z.string().nullable().optional(),
  imageModeTextModel: z.string().default("mimo-v2.6-pro"),
  imageModeTextModelFallback: z.string().default("mimo-v2.6-pro"),
  capabilityEndpoints: z
    .unknown()
    .optional()
    .transform((v) => normalizeCapabilityEndpoints(v ?? {})),
  disabledTools: z.array(z.string()).default([]),
  contextTruncated: z.boolean().default(false),
  sessionContextBudgetTokens: finiteNumber.optional().nullable(),
  clientContextTokens: finiteNumber.optional().nullable(),
  globalContext: z
    .string()
    .max(REQUEST_LIMITS.globalContextChars, `全局背景过长（最多 ${REQUEST_LIMITS.globalContextChars} 字）。`)
    .default(""),
  skills: z
    .array(skillSchema)
    .max(REQUEST_LIMITS.skills, `技能数量超过上限（最多 ${REQUEST_LIMITS.skills} 个）。`)
    .default([]),
  artifacts: z
    .array(
      z
        .object({
          id: z.string(),
          title: z.string().optional(),
          summary: z.string().max(2000).optional(),
          html: z.string().max(REQUEST_LIMITS.canvasSourceChars).optional(),
        })
        .transform((item) => ({
          id: item.id,
          title: String(item.title ?? ""),
          summary: String(item.summary ?? ""),
          html: item.html,
        })),
    )
    .max(16)
    .default([]),
  subjectId: z.string().default("other"),
  categoryId: z.string().default("detail"),
  itemId: z.string().default(""),
  currentTopic: z.string().default(""),
  enableThinking: z.boolean().default(false),
  enableSearch: z.boolean().default(false),
  thinkingEffort: z.enum(["low", "medium", "high", "max"]).default("medium"),
  contextMode: z.enum(["full", "semantic"]).default("full"),
  academicYear: z
    .unknown()
    .default(DEFAULT_ACADEMIC_YEAR)
    .transform((v): AcademicYearId => (isAcademicYearId(v) ? v : DEFAULT_ACADEMIC_YEAR)),
  /** 学生确认沉淀后，本轮才暴露 commitNotes / commitFlashcards。 */
  memoryCommit: z.enum(["note", "flashcards"]).optional(),
  /** 笔记编辑窗点开助教时，当前个人笔记 id + markdown + 版本戳。 */
  editingUserNote: z
    .object({
      id: z.string(),
      title: z.string().optional().default(""),
      markdown: z
        .string()
        .max(REQUEST_LIMITS.textPartChars, `正在编辑的笔记过长（最多 ${REQUEST_LIMITS.textPartChars} 字）。`)
        .optional()
        .default(""),
      /** 草稿依据的正文版本（UserNote.updatedAt），用于点同意时的乐观并发校验。 */
      updatedAt: z.number().optional(),
    })
    .optional(),
  /** 窗内笔记 Agent：与主对话共用前缀，但可收窄工具。 */
  noteWindowAgent: z.boolean().optional(),
  /** Class 模式随请求携带的当前课堂（提纲 + 实时文稿尾部）；有值才挂课堂文稿工具。 */
  classContext: classAgentContextSchema.optional(),
  /** 工具循环上限（1–20，对齐 ToolLoopAgent 默认 stopWhen）。缺省由服务端 clamp 为 6。 */
  maxToolRounds: z.number().finite().optional(),
  /** 设置页「单次输出上限」（token，含思考）。0 / 缺省 = 跟随模型注册表声明的最大输出。 */
  maxOutputTokens: z.number().finite().min(0).optional(),
  /** 设置页「单轮预算上限」（积分）。0 / 缺省 = 运营上限；只能收紧，不能超过运营上限。 */
  turnBudgetCredits: z.number().finite().min(0).optional(),
  /** 计划模式：只读工具，先输出计划文档。 */
  planMode: z.boolean().optional(),
  /** 输入框强制选用的工具或 skill:id。 */
  forcedTool: z.string().max(160).optional(),
  /** 从文件树 / # 选中的笔记地址，服务端按 path 读全文。 */
  attachedFiles: z
    .array(
      z
        .object({
          path: z.string().max(256),
          title: z.string().max(256).optional(),
          kind: z.enum(["file", "folder"]).optional(),
          address: z.string().max(512).optional(),
          subjectId: z.string().max(64).optional(),
          categoryId: z.string().max(64).optional(),
          itemId: z.string().max(160).optional(),
          childPaths: z.array(z.string().max(256)).max(64).optional(),
        })
        .transform((file) => ({
          path: file.path,
          title: String(file.title ?? file.path),
          kind: (file.kind === "folder" ? "folder" : "file") as "file" | "folder",
          address: String(file.address ?? file.path),
          subjectId: String(file.subjectId ?? ""),
          categoryId: String(file.categoryId ?? ""),
          itemId: String(file.itemId ?? ""),
          childPaths: file.childPaths,
        })),
    )
    .max(9)
    .default([]),
  /** 主对话随身携带的本机笔记目录；窗内对话应为空。 */
  userNotes: z
    .array(
      z
        .object({
          id: z.string(),
          title: z.string().optional().default(""),
          subjectId: z.string().nullable().optional().default(null),
          markdown: z.string().max(MAX_MEMORY_NOTE_CHARS).optional().default(""),
          updatedAt: z.number().optional().default(0),
          kind: z.enum(["personal", "classroom"]).optional(),
        })
        .transform((note) => ({
          id: note.id,
          title: String(note.title ?? ""),
          subjectId: note.subjectId ?? null,
          markdown: String(note.markdown ?? ""),
          updatedAt: Number(note.updatedAt ?? 0),
          kind: note.kind,
        })),
    )
    .max(MAX_MEMORY_NOTES)
    .default([]),
  /** 主对话随身携带的复习闪卡目录（复用复习板）。 */
  flashcards: z
    .array(
      z
        .object({
          id: z.string(),
          subjectId: z.string().optional().default(""),
          sourceLabel: z.string().optional().default(""),
          front: z.string().max(MAX_MEMORY_CARD_FIELD_CHARS).optional().default(""),
          back: z.string().max(MAX_MEMORY_CARD_FIELD_CHARS).optional().default(""),
          originalText: z.string().max(MAX_MEMORY_CARD_FIELD_CHARS).optional().default(""),
          explanation: z.string().max(MAX_MEMORY_CARD_FIELD_CHARS).optional(),
          status: z.string().optional().default(""),
        })
        .transform((card) => ({
          id: card.id,
          subjectId: String(card.subjectId ?? ""),
          sourceLabel: String(card.sourceLabel ?? ""),
          front: String(card.front ?? ""),
          back: String(card.back ?? ""),
          originalText: String(card.originalText ?? ""),
          explanation: card.explanation,
          status: String(card.status ?? ""),
        })),
    )
    .max(MAX_MEMORY_CARDS)
    .default([]),
  /**
   * 项目文件目录（只有索引，没有正文）。本机解析产物，服务端读不到浏览器存储，所以随请求上行。
   * 上限都放在这里：目录很小（几十 KB），正文只走 projectSlices。
   */
  projectFiles: z
    .array(
      z
        .object({
          fileId: z.string().max(128),
          cloudFileId: z.string().uuid().optional(),
          name: z.string().max(256).optional().default(""),
          kind: z.enum(["imported", "studio-ref"]).optional().default("imported"),
          status: z.enum(["indexed", "parsing", "error"]).optional().default("indexed"),
          error: z.string().max(512).optional(),
          studioRef: z
            .object({
              path: z.string().max(256),
              title: z.string().max(256).optional().default(""),
              address: z.string().max(512).optional().default(""),
            })
            .optional(),
          slices: z
            .array(
              z.object({
                sliceId: z.string().max(64),
                title: z.string().max(256).optional().default(""),
                chars: finiteNumber.optional().default(0),
                summary: z.string().max(512).optional().default(""),
              }),
            )
            .max(200)
            .default([]),
        })
        .transform((file) => ({
          fileId: file.fileId,
          cloudFileId: file.cloudFileId,
          name: String(file.name ?? ""),
          kind: file.kind,
          status: file.status,
          ...(file.error ? { error: file.error } : {}),
          ...(file.studioRef ? { studioRef: { ...file.studioRef } } : {}),
          slices: file.slices.map((slice) => ({
            sliceId: slice.sliceId,
            title: String(slice.title ?? ""),
            chars: Number(slice.chars ?? 0),
            summary: String(slice.summary ?? ""),
          })),
        })),
    )
    .max(1000)
    .default([]),
  /** 本轮「带入对话」的项目切片正文（单片封顶 12k 字，总预算由客户端裁好）。 */
  projectSlices: z
    .array(
      z.object({
        fileId: z.string().max(128),
        sliceId: z.string().max(64),
        title: z.string().max(256).optional().default(""),
        text: z.string().max(12_000),
      }),
    )
    .max(120)
    .default([]),
}).superRefine((body, ctx) => {
  const latest = [...body.messages].reverse().find(message => message.role === 'user');
  const files = latest?.parts.filter(part => part.type === 'file').length ?? 0;
  if (files + body.attachedFiles.length > 9) ctx.addIssue({ code: 'custom', message: '单次消息的附件总计最多 9 个。' });
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;