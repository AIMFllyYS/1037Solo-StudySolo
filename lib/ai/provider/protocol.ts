import { type CustomApiProtocol, type ThinkingRequestStyle } from "@/lib/ai/models";
import { DEFAULT_CHAT_TIMEOUT_MS } from "@/lib/ai/upstream";

import { assertSafeCustomBaseUrl } from "@/lib/ai/endpoints/customBaseUrl";
import { normalizeOpenAIBaseUrl } from "@/lib/ai/endpoints/openaiBaseUrl";

import type { ImageApiStyle } from "./types";
/**
 * 三选一协议 → 底层 style/reasoningField 自动装配。
 * 这是"业界最佳实践"的核心表：用户只在 UI 挑一个，其余自动。
 */
export function autoConfigFromProtocol(protocol: CustomApiProtocol | undefined): {
  thinkingRequestStyle: ThinkingRequestStyle;
  reasoningField: string;
} {
  switch (protocol) {
    case "anthropic":
      return { thinkingRequestStyle: "anthropic-thinking", reasoningField: "thinking" };
    case "siliconflow":
      return { thinkingRequestStyle: "siliconflow", reasoningField: "reasoning_content" };
    case "openai":
    default:
      // OpenAI 官方 o1/o3、DeepSeek-R1、One-API/OpenRouter 转发普遍返回 "reasoning" 或 "reasoning_content"。
      // 用 REASONING_FIELD 作为兜底（其内部会尝试多个别名）。
      return { thinkingRequestStyle: "openai-reasoning-effort", reasoningField: "reasoning" };
  }
}

export const THINKING_REQUEST_STYLES: ThinkingRequestStyle[] = [
  "none",
  "siliconflow",
  "openai-reasoning-effort",
  "openrouter-reasoning",
  "anthropic-thinking",
  "gemini-thinking-level",
  "deepseek-thinking",
  "mimo-thinking",
  "qiniu-toggle",
];

export function normalizeThinkingRequestStyle(value: unknown, fallback: ThinkingRequestStyle): ThinkingRequestStyle {
  return THINKING_REQUEST_STYLES.includes(value as ThinkingRequestStyle)
    ? (value as ThinkingRequestStyle)
    : fallback;
}

/** 老配置向新协议字段的迁移推断：thinkingRequestStyle → apiProtocol。 */
export function inferProtocolFromLegacy(style: unknown): CustomApiProtocol {
  if (style === "anthropic-thinking") return "anthropic";
  if (style === "siliconflow") return "siliconflow";
  return "openai";
}

export function normalizeImageApiStyle(value: unknown): ImageApiStyle {
  return value === "openai" || value === "siliconflow" || value === "auto" ? value : "auto";
}

export function safeNormalizedCustomBaseUrl(url: string): string {
  return normalizeOpenAIBaseUrl(assertSafeCustomBaseUrl(url));
}

export function customTimeoutMs(modelTimeout?: number, groupTimeout?: number): number {
  for (const raw of [modelTimeout, groupTimeout]) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  }
  return DEFAULT_CHAT_TIMEOUT_MS;
}

export function detectImageApiStyle(
  apiModelId: string,
  configuredStyle: ImageApiStyle = "auto",
): "openai" | "siliconflow" {
  if (configuredStyle === "openai" || configuredStyle === "siliconflow") return configuredStyle;
  return /^(gpt-image|dall-e)/i.test(apiModelId) ? "openai" : "siliconflow";
}

/** base 末尾去斜杠后拼出 /chat/completions。 */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** base 末尾去斜杠后拼出 /images/generations。 */
export function imagesGenerationsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

/** 深度思考预算（token），按用户选择的力度映射。 */
export function thinkingBudget(effort: string | undefined): number {
  switch (effort) {
    case "low":
      return 2000;
    case "high":
      return 16000;
    case "max":
      return 32000;
    case "medium":
    default:
      return 8000;
  }
}