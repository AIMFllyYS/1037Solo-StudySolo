// FollowUp 追问生成：主对话流结束后模型未输出 <FollowUp> 时的轻量兜底，
// 以及 /api/follow-ups 独立接口共用的 generateText 封装。

import { generateText } from "ai";
import { ENV_MODEL_FLASH, type CustomProvider } from "@/lib/ai/provider";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import type { CustomApiGroup } from "@/lib/ai/models";
import { resolveActualBillingModelId, settleUsage } from "@/lib/billing/ledger/usageLedger";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

const FOLLOWUP_TIMEOUT_MS = 10_000;

const FALLBACK_SYSTEM =
  "你是学习助教。根据学生的提问和助教的回答，生成3个学生可能想继续追问的问题。只输出问题本身，用|分隔，不要编号或额外说明。问题应简洁（15字以内）、有针对性、层层递进。";

/** 清理编号前缀（1. 2. 3.）与换行，只保留 | 分隔的问题。 */
export function parsePipeSeparatedQuestions(raw: string): string[] {
  return raw
    .replace(/^\d+[.、)]\s*/gm, "")
    .replace(/\n+/g, "|")
    .replace(/\|+/g, "|")
    .trim()
    .split("|")
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function parseJsonArrayQuestions(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.map((x) => String(x)).slice(0, 3) : [];
  } catch {
    return [];
  }
}

export interface FallbackFollowUpsInput {
  userText: string;
  answerText: string;
  /** 主对话所用的 registryId；自定义模型沿用自身，内置模型改用 flash 模型省钱。 */
  modelId: string;
  isCustom: boolean;
  custom?: CustomApiGroup[] | CustomProvider | null;
  abortSignal?: AbortSignal;
}

/** 主对话结束后的追问兜底。任何失败都返回空数组，绝不影响主流程。 */
export async function generateFallbackFollowUps(input: FallbackFollowUpsInput): Promise<string[]> {
  try {
    const targetModel = input.isCustom ? input.modelId : ENV_MODEL_FLASH;
    const resolved = resolveLanguageModel(targetModel, input.custom);
    const signals: AbortSignal[] = [AbortSignal.timeout(FOLLOWUP_TIMEOUT_MS)];
    if (input.abortSignal) signals.push(input.abortSignal);
    const result = await generateText({
      model: resolved.model,
      instructions: FALLBACK_SYSTEM,
      prompt: `学生提问：${input.userText.slice(0, 500)}\n\n助教回答（摘要）：${input.answerText.slice(0, 1000)}\n\n请生成3个追问：`,
      temperature: 0.5,
      maxOutputTokens: 200,
      maxRetries: 0,
      abortSignal: AbortSignal.any(signals),
    });
    const actual = resolved.getActualProvider();
    const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(actual));
    await settleUsage({
      rawUsage: result.totalUsage ?? result.usage,
      route: "/api/follow-ups",
      kind: "llm",
      selectedModelId: targetModel,
      actualModelId: resolveActualBillingModelId(actual),
      customGroups: Array.isArray(input.custom) ? input.custom : undefined,
      pool: pool ?? undefined,
      skipInsert: pool == null,
      meta: { source: "followup-fallback" },
    });
    return parsePipeSeparatedQuestions(result.text);
  } catch (err) {
    console.warn("[FollowUp fallback] failed:", (err as Error)?.message);
    return [];
  }
}
