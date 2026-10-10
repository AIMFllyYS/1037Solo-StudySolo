import { z } from "zod";

import { REQUEST_LIMITS } from "./limits";
import { satelliteApiGroupsSchema, customProviderSchema, finiteNumber } from "./shared";
export const artifactRequestSchema = z.object({
  id: z.unknown().optional(),
  title: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
  prompt: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
  modelId: z.string().optional(),
  customApiGroups: satelliteApiGroupsSchema,
  customProvider: customProviderSchema.optional(),
});

export const documentRequestSchema = z.object({
  id: z.unknown().optional(),
  spec: z.unknown().optional(),
  modelId: z.string().optional(),
  customApiGroups: satelliteApiGroupsSchema,
  customProvider: customProviderSchema.optional(),
  phase: z.enum(["outline", "section"]).optional(),
  outline: z.array(z.unknown()).max(64).optional(),
  sectionIndex: finiteNumber.optional(),
  previousMarkdown: z.string().max(REQUEST_LIMITS.documentPreviousMarkdownChars).optional(),
});

export const imageGenRequestSchema = z.object({
  modelId: z.string().optional(),
  prompt: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
  size: z.string().optional(),
  count: z.unknown().optional(),
  customApiGroups: satelliteApiGroupsSchema,
  defaultImageModelId: z.string().nullable().optional(),
  capabilityEndpoints: z.unknown().optional(),
  probe: z.boolean().optional(),
});

export const recordRequestSchema = z.object({
  mode: z.string().optional(),
  text: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
  userInstruction: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
  currentCard: z.unknown().optional(),
  subjectName: z.string().optional(),
  categoryName: z.string().optional(),
  itemLabel: z.string().optional(),
  enableThinking: z.boolean().optional(),
  customApiGroups: satelliteApiGroupsSchema,
  modelId: z.string().optional(),
});

export const canvasReviseRequestSchema = z
  .object({
    modelId: z.string().optional(),
    customApiGroups: satelliteApiGroupsSchema,
    instruction: z.string().max(REQUEST_LIMITS.satellitePromptChars).optional(),
    topic: z.string().max(8 * 1024).optional(),
    block: z.unknown().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.block == null) return;
    const encoded = typeof body.block === "string" ? body.block : JSON.stringify(body.block);
    if (encoded.length > REQUEST_LIMITS.canvasSourceChars) {
      ctx.addIssue({ code: "custom", message: "画布内容过大，请缩小后重试。" });
    }
  });

export type ArtifactRequest = z.infer<typeof artifactRequestSchema>;
export type DocumentRequest = z.infer<typeof documentRequestSchema>;
export type ImageGenRequest = z.infer<typeof imageGenRequestSchema>;
export type RecordRequest = z.infer<typeof recordRequestSchema>;
export type CanvasReviseRequest = z.infer<typeof canvasReviseRequestSchema>;