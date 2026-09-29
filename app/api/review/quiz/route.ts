import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { ENV_MODEL_PRO } from "@/lib/ai/provider";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { createQuizInputSchema, normalizeQuiz } from "@/lib/ai/agent/quizTool";
import type { CreateQuizInput } from "@/lib/ai/agent/tools/createQuiz/types";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { resolveActualBillingModelId, settleUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review 模式「答题」板块的出题接口 —— 复用 createQuiz 工具的 schema 与归一化，
 * 生成结构化题目直接喂给 QuizRunner。这是嵌入式复习页无法走完整对话流时的等价路径：
 * 鉴权与计费**逐字复用** /api/follow-ups（withPaidRequest → quota gate → settleUsage），
 * 绝不产生未计费的模型调用。
 *
 * 路由：POST /api/review/quiz
 * body：{ instruction: string, mode?: "wrong"|"chapter", subjectName?: string }
 * 返回：{ title, intent, questions, droppedCount } —— 无凭证 / 配额不足时 questions 为空数组。
 */
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const instruction: string = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const title: string = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "复习出题";
  const intent: "diagnose" | "practice" | "exam" | "check" =
    body.mode === "wrong" ? "diagnose" : "practice";

  const { model, provider } = resolveLanguageModel(ENV_MODEL_PRO);
  if (!provider.configured || !instruction) {
    return NextResponse.json({ title, intent, questions: [], droppedCount: 0 });
  }

  const userId = await resolveQuotaUserId(req.headers);
  const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
  const gate = await assertQuotaAvailable({ userId, pool });
  if (!gate.ok) {
    return NextResponse.json({ title, intent, questions: [], droppedCount: 0, error: "quota" });
  }

  try {
    const result = await generateObject({
      model,
      schema: createQuizInputSchema,
      temperature: 0.6,
      system:
        "你是学习复习助教，负责按学生的薄弱点或指定章节出一套可自动判分的复习题。" +
        "只输出结构化题目：选择题给足选项与正确下标，判断/辨析题 answer 用 1（正确）/0（错误），" +
        "填空 / 简答给参考答案；每题都要有 explanation 解析并标出易错点。题量 6–10 道，题型混合。",
      prompt: instruction,
      maxRetries: 1,
      abortSignal: req.signal,
    });

    await settleUsage({
      headers: req.headers,
      rawUsage: result.usage,
      route: "/api/review/quiz",
      kind: "llm",
      selectedModelId: ENV_MODEL_PRO,
      actualModelId: resolveActualBillingModelId(provider),
      pool: pool ?? undefined,
      skipInsert: pool == null,
      meta: { source: "review-quiz-route" },
    });

    const input = result.object as CreateQuizInput;
    const quizId = `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const normalized = normalizeQuiz(input, quizId);
    return NextResponse.json({
      quizId,
      title: (input.title ?? title).trim() || title,
      intent: input.intent ?? intent,
      questions: normalized.questions,
      droppedCount: normalized.droppedCount,
    });
  } catch (err) {
    logSatelliteError("/api/review/quiz", err);
    return NextResponse.json({ title, intent, questions: [], droppedCount: 0, error: "generation_failed" });
  }
}

export const POST = withPaidRequest(handlePOST, "/api/review/quiz");
