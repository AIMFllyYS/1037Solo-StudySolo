// 长文档分节流式生成：与 /api/document 配合，独立 SSE 输出 outline / section 事件。

import type { LanguageModel } from "ai";
import { streamRouteText } from "@/lib/ai/sdk/routeGeneration";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { settleUsage } from "@/lib/billing/ledger/usageLedger";
import {
  buildOutlineInstructions,
  buildOutlinePrompt,
  buildSectionInstructions,
  buildSectionPrompt,
  buildContinuationPrompt,
  parseOutline,
  ensureSectionHeading,
  targetWordsOf,
} from "@/lib/documents/prompts";
import type {
  DocumentApiEvent,
  DocumentOutlineRequest,
  DocumentSectionRequest,
} from "@/lib/documents/types";

interface StreamDocumentOptions {
  send: (event: DocumentApiEvent) => void;
  id: string;
  request: DocumentOutlineRequest | DocumentSectionRequest;
  model: LanguageModel;
  /** 单阶段首字节 / 流中断超时。 */
  timeoutMs?: number;
  signal?: AbortSignal;
  secrets?: string[];
}

const CONTINUATION_MAX = 2;
const PREVIOUS_TAIL_LEN = 1200;

export async function streamDocument(options: StreamDocumentOptions): Promise<void> {
  const { request } = options;
  if (request.phase === "outline") {
    return streamOutline(options, request);
  }
  return streamSection(options, request);
}

async function streamOutline(
  { send, id, model, timeoutMs = 90_000, signal, secrets = [] }: StreamDocumentOptions,
  outlineReq: DocumentOutlineRequest,
): Promise<void> {
  send({ type: "document", id, status: "start", phase: "outline" });
  try {
    const spec = outlineReq.spec;
    const { text, usage } = await streamRouteText({
      model,
      instructions: buildOutlineInstructions(spec),
      prompt: buildOutlinePrompt(spec),
      temperature: 0.4,
      maxOutputTokens: 4096,
      abortSignal: signal,
      idleTimeoutMs: timeoutMs,
      onText: (delta) => send({ type: "document", id, status: "delta", delta }),
      onReasoning: (delta) => send({ type: "document", id, status: "reasoning", delta }),
    });
    await settleUsage({
      rawUsage: usage,
      route: "/api/document",
      kind: "llm",
      meta: { source: "document-outline", phase: "outline" },
    });

    let outline = parseOutline(text);
    if (!outline.length && spec.outline?.length) {
      outline = spec.outline.map((title) => ({ title, brief: "" }));
    }
    if (!outline.length) {
      send({ type: "document", id, status: "error", message: "未能解析出章节大纲，模型可能未按 JSON 数组格式输出。" });
      return;
    }
    send({ type: "document", id, status: "outline", outline });
  } catch (err) {
    logSatelliteError("/api/document", err);
    send({
      type: "document",
      id,
      status: "error",
      message: toChatErrorMessage(err, secrets),
    });
  }
}

async function streamSection(
  { send, id, model, timeoutMs = 120_000, signal, secrets = [] }: StreamDocumentOptions,
  sectionReq: DocumentSectionRequest,
): Promise<void> {
  send({ type: "document", id, status: "start", phase: "section", sectionIndex: sectionReq.sectionIndex });
  try {
    const { spec, outline, sectionIndex, previousMarkdown } = sectionReq;
    const section = outline[sectionIndex];
    if (!section) {
      send({ type: "document", id, status: "error", message: "sectionIndex 超出章节范围" });
      return;
    }

    const words = targetWordsOf(spec);
    const perSection = Math.max(250, Math.round(words / Math.max(outline.length, 1)));
    const maxOutputTokens = Math.min(8192, Math.max(4096, Math.round(perSection * 2.5) + 1024));

    const previousTail = previousMarkdown.trim().slice(-PREVIOUS_TAIL_LEN) || (sectionIndex > 0 ? "（继续下一节）" : "");

    const run = async (
      prompt: string,
      isContinuation: boolean,
    ): Promise<{ text: string; finishReason: string }> => {
      const streamed = await streamRouteText({
        model,
        instructions: isContinuation
          ? `你是资深写作者。正在续写一节被截断的内容。只输出后续正文，不要重复已写内容，不要重新写标题，不要加任何说明。`
          : buildSectionInstructions(spec, outline, sectionIndex),
        prompt,
        temperature: 0.45,
        maxOutputTokens,
        abortSignal: signal,
        idleTimeoutMs: timeoutMs,
        onText: (delta) => send({ type: "document", id, status: "delta", delta }),
        onReasoning: isContinuation ? undefined : (delta) => send({ type: "document", id, status: "reasoning", delta }),
      });
      await settleUsage({
        rawUsage: streamed.usage,
        route: "/api/document",
        kind: "llm",
        meta: {
          source: isContinuation ? "document-section-continuation" : "document-section",
          phase: "section",
          sectionIndex,
          continuation: isContinuation,
        },
      });
      return streamed;
    };

    let result = await run(buildSectionPrompt(spec, outline, sectionIndex, previousTail), false);
    let full = result.text;
    let continued = 0;

    while (result.finishReason === "length" && continued < CONTINUATION_MAX) {
      continued++;
      result = await run(buildContinuationPrompt(full), true);
      full += result.text;
    }

    const markdown = ensureSectionHeading(full, section.title);
    send({ type: "document", id, status: "section-done", sectionIndex, markdown, continued });
  } catch (err) {
    logSatelliteError("/api/document", err);
    send({
      type: "document",
      id,
      status: "error",
      message: toChatErrorMessage(err, secrets),
    });
  }
}
