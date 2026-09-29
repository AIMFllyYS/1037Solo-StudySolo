import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateText } from "ai";
import { SUBJECTS } from "@/lib/constants/subjects";
import { ENV_MODEL_FLASH } from "@/lib/ai/provider";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { parseJsonArrayQuestions } from "@/lib/ai/agent/followUps";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { resolveActualBillingModelId, settleUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

function asClientMessage(value: unknown): ClientMessage | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (rec.role !== "user" && rec.role !== "assistant") return null;
  if (typeof rec.content !== "string") return null;
  return { role: rec.role, content: rec.content };
}

async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages: ClientMessage[] = Array.isArray(body.messages)
    ? (body.messages as unknown[]).map(asClientMessage).filter((message): message is ClientMessage => message != null)
    : [];
  const subjectId: string = String(body.subjectId ?? "probability");
  const categoryId: string = String(body.categoryId ?? "detail");
  const itemId: string = String(body.itemId ?? "");

  const { model, provider } = resolveLanguageModel(ENV_MODEL_FLASH);
  if (!provider.configured || messages.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  const userId = await resolveQuotaUserId(req.headers);
  const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
  const gate = await assertQuotaAvailable({ userId, pool });
  if (!gate.ok) {
    return NextResponse.json({ questions: [] });
  }

  const subjectName = SUBJECTS[subjectId as keyof typeof SUBJECTS] || subjectId;
  const recent = messages.slice(-4);

  try {
    const result = await generateText({
      model,
      temperature: 0.8,
      instructions:
        `你是「${subjectName}」课程的学习追问助手。` +
        `当前上下文：科目 ${subjectName}，分类 ${categoryId}，内容项 ${itemId || "(未指定)"}。` +
        `基于给定对话，提出 3 个简短、具体、能引发举一反三式深入思考的后续问题（站在学生视角）。` +
        `只输出一个 JSON 字符串数组，例如 ["问题一","问题二","问题三"]，每条不超过 28 字，不要任何额外文字。`,
      messages: [
        ...recent,
        { role: "user", content: "请据此给出 3 个举一反三的追问（仅 JSON 数组）。" },
      ],
      maxRetries: 0,
      abortSignal: req.signal,
      timeout: provider.timeoutMs,
    });
    await settleUsage({
      headers: req.headers,
      rawUsage: result.totalUsage ?? result.usage,
      route: "/api/follow-ups",
      kind: "llm",
      selectedModelId: ENV_MODEL_FLASH,
      actualModelId: resolveActualBillingModelId(provider),
      pool: pool ?? undefined,
      skipInsert: pool == null,
      meta: { source: "follow-ups-route" },
    });
    return NextResponse.json({ questions: parseJsonArrayQuestions(result.text) });
  } catch (err) {
    logSatelliteError("/api/follow-ups", err);
    return NextResponse.json({ questions: [] });
  }
}

export const POST = withPaidRequest(handlePOST, "/api/follow-ups");
