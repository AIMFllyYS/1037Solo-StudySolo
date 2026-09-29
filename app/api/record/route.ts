import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import type { RecordCardAI, RecordMode } from "@/lib/review/types";
import { ENV_MODEL_FLASH } from "@/lib/ai/provider";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { streamRouteText } from "@/lib/ai/sdk/routeGeneration";
import { collectRequestSecrets, formatRequestError, parseRecordRequest } from "@/lib/ai/agent/requestSchema";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { resolveActualBillingModelId, settleUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

// 「记录」成卡路由（SSE 流式）：把用户划词/右键选中的原文，按用户选择的模式流式转成复习卡片。
// 输出纯 Markdown 富文本（===FRONT=== / ===BACK=== / ===BLANKS=== 分隔），前端流式渲染 + 思考折叠。
// 端点解析复用 resolveProvider —— 与 /api/chat 完全一致。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT = 6000;

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const MODE_PROMPTS: Record<RecordMode, string> = {
  excerpt:
    `你是学习笔记摘录助手。把用户选中的原文整理成一张摘录卡片。\n` +
    `要求：\n` +
    `- 保证原文内容完整不丢失任何信息\n` +
    `- 如果发现文字不全（划词边界不精确），自行合理补全\n` +
    `- 明显无用内容（如页码、广告）可删除\n` +
    `- 保持原渲染格式（Markdown/公式/表格等）\n` +
    `- 其余内容不更改\n` +
    `- 全部用中文；数学/化学公式用 $...$ 行内、$$...$$ 块级（KaTeX/mhchem 语法）\n` +
    `- 如果用户提供了补充内容或修改要求，以用户的规定优先\n\n` +
    `输出格式（纯 Markdown，不要代码围栏）：\n` +
    `===FRONT===\n（摘录的完整内容，保持原格式）\n` +
    `===BACK===\n（1-3 句记忆提示或关键词，帮助回忆）`,
  cloze:
    `你是学习记忆卡片生成器。把用户选中的原文整理成一张填空闪卡。\n` +
    `要求：\n` +
    `- 保证原文内容完整不丢失任何信息\n` +
    `- 合理选择 1-3 个最关键的术语/数值/公式挖空，用「____」占位\n` +
    `- 特殊场景自主判断挖空方式：\n` +
    `  · 中文+译文对照内容 → 去掉中文部分或译文部分挖空\n` +
    `  · 单词讲解类外语场景 → 去掉词组搭配挖空\n` +
    `  · 根据内容特点选择最合适的挖空方式\n` +
    `- 全部用中文；数学/化学公式用 $...$ 行内、$$...$$ 块级（KaTeX/mhchem 语法）\n` +
    `- 如果用户提供了补充内容或修改要求，以用户的规定优先\n\n` +
    `输出格式（纯 Markdown，不要代码围栏）：\n` +
    `===FRONT===\n（挖空后的文本，关键处用 ____ 占位）\n` +
    `===BACK===\n（填空后的完整正确文本）\n` +
    `===BLANKS===\n（被挖去的答案，用 | 分隔，如：动能|质量）`,
  quiz:
    `你是学习出题助手。根据用户选中的原文出一道综合题，把所有信息融入一道题中。\n` +
    `要求：\n` +
    `- 不丢失所选内容的信息，巧妙把所有内容出到一道综合题中\n` +
    `- 题型根据内容自适应（填空/选择/排序/大题等）\n` +
    `- 题目要合理、可答\n` +
    `- 全部用中文；数学/化学公式用 $...$ 行内、$$...$$ 块级（KaTeX/mhchem 语法）\n` +
    `- 如果用户提供了补充内容或修改要求，以用户的规定优先\n\n` +
    `输出格式（纯 Markdown，不要代码围栏）：\n` +
    `===FRONT===\n（题目）\n` +
    `===BACK===\n（答案 + 解析）`,
  custom:
    `你是学习内容处理助手。按用户的要求处理选中的原文，生成一张复习卡片。\n` +
    `要求：\n` +
    `- 按用户输入的指令处理原文\n` +
    `- 仍保证原文信息不丢失\n` +
    `- 全部用中文；数学/化学公式用 $...$ 行内、$$...$$ 块级（KaTeX/mhchem 语法）\n` +
    `- 以用户的规定优先\n\n` +
    `输出格式（纯 Markdown，不要代码围栏）：\n` +
    `===FRONT===\n（处理结果正面）\n` +
    `===BACK===\n（处理结果背面，如补充说明或为空）`,
};

const REVISE_PROMPT =
  `你是学习记忆卡片编辑器。下面给你一张已生成的卡片、它的原文，以及用户的优化要求。\n` +
  `请按用户要求改写这张卡片。\n` +
  `要求：\n` +
  `- 按用户要求优化卡片内容\n` +
  `- 全部用中文；数学/化学公式用 $...$ 行内、$$...$$ 块级（KaTeX/mhchem 语法）\n` +
  `- 内容忠于原文，不杜撰\n` +
  `- 以用户的规定优先\n\n` +
  `输出格式（纯 Markdown，不要代码围栏）：\n` +
  `===FRONT===\n（优化后的正面内容）\n` +
  `===BACK===\n（优化后的背面内容）\n` +
  `===BLANKS===\n（如果是填空卡，列出被挖答案，用 | 分隔；否则省略此行）`;

function clampInput(text: string): string {
  if (text.length <= MAX_INPUT) return text;
  return text.slice(0, MAX_INPUT) + "…（原文过长已截断）";
}

function parseCardContent(raw: string, mode: RecordMode): RecordCardAI {
  const markerRegex = /===(\w+)===/g;
  const markers: { name: string; index: number; length: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRegex.exec(raw)) !== null) {
    markers.push({ name: m[1].toLowerCase(), index: m.index, length: m[0].length });
  }

  if (markers.length === 0) {
    return { mode, cardType: mode, front: raw.trim(), back: "" };
  }

  const sections: Record<string, string> = {};
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : raw.length;
    sections[markers[i].name] = raw.slice(start, end).trim();
  }

  const front = sections.front || raw.trim();
  const back = sections.back || "";
  const blanksStr = sections.blanks || "";
  const blanks = blanksStr
    ? blanksStr.split("|").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    mode,
    cardType: mode,
    front,
    back,
    blanks: blanks?.length ? blanks : undefined,
  };
}

async function handlePOST(req: NextRequest) {
  let body: ReturnType<typeof parseRecordRequest>;
  try {
    body = parseRecordRequest(await req.json().catch(() => ({})));
  } catch (err) {
    return new Response(sse({ type: "error", message: formatRequestError(err) }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  const mode = body.mode as RecordMode;
  const text: string = typeof body.text === "string" ? body.text.trim() : "";
  const userInstruction: string =
    typeof body.userInstruction === "string" ? body.userInstruction.trim() : "";
  const currentCard = body.currentCard as RecordCardAI | undefined;
  const subjectName: string = String(body.subjectName ?? "");
  const categoryName: string = String(body.categoryName ?? "");
  const itemLabel: string = String(body.itemLabel ?? "");
  const enableThinking: boolean = body.enableThinking === true;
  const customApiGroups = body.customApiGroups;
  const modelId: string | undefined =
    typeof body.modelId === "string" && body.modelId.trim()
      ? body.modelId
      : ENV_MODEL_FLASH;
  const secrets = collectRequestSecrets({ customApiGroups });

  const validModes: RecordMode[] = ["excerpt", "cloze", "quiz", "custom"];
  if (!validModes.includes(mode)) {
    return new Response(sse({ type: "error", message: "无效的处理模式" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (!text) {
    return new Response(sse({ type: "error", message: "原文为空" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const resolved = resolveLanguageModel(modelId, customApiGroups);
  const { provider } = resolved;
  if (provider.apiKey) secrets.push(provider.apiKey);
  const userId = await resolveQuotaUserId(req.headers);
  const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
  const gate = await assertQuotaAvailable({ userId, pool });
  if (!gate.ok) {
    return new Response(sse({ type: "error", message: gate.error }), {
      status: 402,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (!provider.configured) {
    return new Response(sse({ type: "error", message: "AI 服务未配置（请先填写密钥）" }), {
      status: 503,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const contextLine =
    `当前出处：${[subjectName, categoryName, itemLabel].filter(Boolean).join(" / ") || "(未指定)"}。`;

  const isRevise = !!currentCard;
  const systemPrompt = isRevise ? REVISE_PROMPT : MODE_PROMPTS[mode];

  let userMessage: string;
  if (isRevise) {
    userMessage =
      `${contextLine}\n` +
      `原文参考：\n"""\n${clampInput(text)}\n"""\n\n` +
      `当前卡片正面：\n${currentCard!.front}\n\n` +
      `当前卡片背面：\n${currentCard!.back}\n\n` +
      `用户优化要求：${userInstruction}\n` +
      `请按上述格式输出优化后的卡片。`;
  } else {
    userMessage =
      `${contextLine}\n` +
      `请把下面的原文按要求处理：\n"""\n${clampInput(text)}\n"""` +
      (userInstruction ? `\n\n用户补充要求：${userInstruction}` : "");
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const signal = AbortSignal.any([req.signal, abortController.signal]);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(sse(o)));
      };

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let firstContentSent = false;
      const startHeartbeat = () => {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(() => {
          if (!firstContentSent && !cancelled) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        }, 15000);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      };
      startHeartbeat();

      try {
        const result = await streamRouteText({
          model: resolved.model,
          instructions: systemPrompt,
          prompt: userMessage,
          temperature: 0.4,
          ...(enableThinking ? resolved.thinkingSettings("medium") : {}),
          abortSignal: signal,
          idleTimeoutMs: provider.timeoutMs,
          onReasoning: (delta) => send({ type: "reasoning", delta }),
          onText: (delta) => {
            firstContentSent = true;
            stopHeartbeat();
            send({ type: "content", delta });
          },
        });
        await settleUsage({
          headers: req.headers,
          rawUsage: result.usage,
          route: "/api/record",
          kind: "llm",
          selectedModelId: modelId,
          actualModelId: resolveActualBillingModelId(provider),
          customGroups: customApiGroups,
          pool: pool ?? undefined,
          skipInsert: pool == null,
          meta: { source: "record", mode, revise: isRevise },
        });
        const card = parseCardContent(result.text, mode);
        send({ type: "result", card, model: provider.registryId });
        send({ type: "done" });
      } catch (err) {
        logSatelliteError("/api/record", err);
        send({ type: "error", message: toChatErrorMessage(err, secrets) });
        send({ type: "done" });
      } finally {
        stopHeartbeat();
        if (!cancelled) controller.close();
      }
    },
    cancel(reason) {
      cancelled = true;
      abortController.abort(reason);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const POST = withPaidRequest(handlePOST, "/api/record");
