import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import { generateText } from "ai";
import {
  DEFAULT_SESSION_TITLE_MODEL,
  SESSION_TITLE_SYSTEM_PROMPT,
  buildFallbackSessionTitle,
  sanitizeGeneratedTitle,
} from "@/lib/chat/session/sessionTitle";
import { callFastModel, fastModelConfig } from "@/lib/ai/fastModel";
import { resolveLanguageModel, UPSTREAM_PROVIDER_NAME } from "@/lib/ai/sdk/languageModel";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { settleUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RELAY_BASE_URL = "https://relay.protocom.org/v1";

function titleProvider() {
  return {
    baseUrl:
      process.env.AI_TITLE_BASE_URL ||
      process.env.RELAY_BASE_URL ||
      process.env.SILICONFLOW_BASE_URL ||
      DEFAULT_RELAY_BASE_URL,
    apiKey:
      process.env.AI_TITLE_API_KEY ||
      process.env.RELAY_API_KEY ||
      process.env.SILICONFLOW_API_KEY ||
      process.env.AI_API_KEY ||
      "",
    model: process.env.AI_TITLE_MODEL || DEFAULT_SESSION_TITLE_MODEL,
  };
}

async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const content = String(body.content ?? "");
  const fallback = buildFallbackSessionTitle(content);
  const provider = titleProvider();

  if (!content.trim() || !provider.apiKey) {
    return Response.json({ title: fallback, generated: false, model: provider.model });
  }

  const userId = await resolveQuotaUserId(req.headers);
  const gate = await assertQuotaAvailable({ userId, pool: "platform" });
  if (!gate.ok) {
    return Response.json({ title: fallback, generated: false, model: provider.model });
  }

  // 首选：极轻量快速模型（七牛云 doubao，关思考 + temperature 0，实测 ~1.2s）。
  // 命名是很简单的任务，没必要让主力模型来干，也不该让它带上思考。
  const fast = fastModelConfig();
  if (fast.enabled) {
    const result = await callFastModel({
      system: SESSION_TITLE_SYSTEM_PROMPT,
      user: `请为这次 AI 对话生成标题：\n${content.slice(0, 1800)}`,
      maxTokens: 48,
      temperature: 0.3,
    });
    if (result?.text) {
      // 计费是尽力而为：单价表里没有这个内部模型时也不能让标题失败。
      try {
        await settleUsage({
          headers: req.headers,
          rawUsage: result.usage
            ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
              }
            : undefined,
          route: "/api/chat-title",
          kind: "llm",
          selectedModelId: result.model,
          actualModelId: result.model,
          pool: "platform",
          meta: { source: "chat-title" },
        });
      } catch {
        // 忽略：标题已生成，记账问题不该影响用户。
      }
      return Response.json({
        title: sanitizeGeneratedTitle(result.text, fallback),
        generated: true,
        model: result.model,
      });
    }
  }

  try {
    // Title credentials/model deliberately have their own precedence. Resolve
    // this explicit endpoint as custom so unknown title models never become Flash.
    const resolved = resolveLanguageModel("custom", provider, { platformManagedCredentials: true });
    const result = await generateText({
      model: resolved.model,
      instructions: SESSION_TITLE_SYSTEM_PROMPT,
      prompt: `请为这次 AI 对话生成标题：\n${content.slice(0, 1800)}`,
      temperature: 0.2,
      maxOutputTokens: 48,
      providerOptions: { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: "low" } },
      maxRetries: 0,
      abortSignal: req.signal,
      timeout: resolved.provider.timeoutMs,
    });
    await settleUsage({
      headers: req.headers,
      rawUsage: result.totalUsage ?? result.usage,
      route: "/api/chat-title",
      kind: "llm",
      selectedModelId: provider.model,
      actualModelId: provider.model,
      pool: "platform",
      meta: { source: "chat-title" },
    });
    return Response.json({
      title: sanitizeGeneratedTitle(result.text, fallback),
      generated: true,
      model: provider.model,
    });
  } catch (err) {
    logSatelliteError("/api/chat-title", err);
    return Response.json({ title: fallback, generated: false, model: provider.model });
  }
}

export const POST = withPaidRequest(handlePOST, "/api/chat-title");
