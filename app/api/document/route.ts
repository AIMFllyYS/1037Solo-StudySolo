import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { streamDocument } from "@/lib/ai/document";
import { validateDocumentSpec } from "@/lib/ai/agent/documentTool";
import { collectRequestSecrets, formatRequestError, parseDocumentRequest } from "@/lib/ai/agent/requestSchema";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { getModelInfoWithCustom } from "@/lib/ai/models";
import type { DocumentApiRequest } from "@/lib/documents/types";
import { resolveActualBillingModelId, withRequestLedger } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function handlePOST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  let body: ReturnType<typeof parseDocumentRequest>;
  try {
    body = parseDocumentRequest(raw);
  } catch (err) {
    const documentId = String((raw as { id?: unknown })?.id ?? "");
    return new Response(sse({ type: "document", id: documentId, status: "error", message: formatRequestError(err) }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }
  const documentId = String(body.id ?? "");
  const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
  const customApiGroups = body.customApiGroups;
  const customProvider = body.customProvider;
  const secrets = collectRequestSecrets({ customApiGroups, customProvider });

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const signal = AbortSignal.any([req.signal, abortController.signal]);
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(sse(o)));
      };
      const pingTimer = setInterval(() => {
        send({ type: "ping", t: Date.now() });
      }, 15000);

      try {
        if (!documentId) {
          send({ type: "document", id: "", status: "error", message: "缺少 document id" });
          return;
        }
        if (!body.spec || typeof body.spec !== "object") {
          send({ type: "document", id: documentId, status: "error", message: "缺少文档参数 spec" });
          return;
        }
        const validated = validateDocumentSpec(body.spec);
        if (!validated.ok) {
          send({ type: "document", id: documentId, status: "error", message: validated.error });
          return;
        }
        const spec = validated.spec;

        const resolved = resolveLanguageModel(modelId, customApiGroups.length > 0 ? customApiGroups : customProvider);
        const { model, provider } = resolved;
        if (provider.apiKey) secrets.push(provider.apiKey);
        const info = getModelInfoWithCustom(provider.registryId, customApiGroups);
        if (info?.type === "image") {
          send({ type: "document", id: documentId, status: "error", message: "当前生图模型不支持长文档撰写，请切换文本模型后重试。" });
          return;
        }
        if (!provider.configured) {
          send({ type: "document", id: documentId, status: "error", message: "AI 暂未配置，请先配置 AI_BASE_URL / AI_API_KEY 或自定义模型。" });
          return;
        }

        const userId = await resolveQuotaUserId(req.headers);
        const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
        const gate = await assertQuotaAvailable({ userId, pool });
        if (!gate.ok) {
          send({ type: "document", id: documentId, status: "error", message: gate.error });
          return;
        }

        const request: DocumentApiRequest = {
          id: documentId,
          spec,
          modelId,
          customApiGroups,
          customProvider,
          phase: body.phase ?? "outline",
          ...(body.phase === "section"
            ? {
                outline: Array.isArray(body.outline) ? body.outline : [],
                sectionIndex: typeof body.sectionIndex === "number" ? body.sectionIndex : 0,
                previousMarkdown: typeof body.previousMarkdown === "string" ? body.previousMarkdown : "",
              }
            : {}),
        } as DocumentApiRequest;

        const timeoutMs = info?.thinkingRequired ? Math.max(provider.timeoutMs, 120_000) : provider.timeoutMs;

        await withRequestLedger(
          req.headers,
          {
            route: "/api/document",
            selectedModelId: modelId ?? provider.registryId,
            actualModelId: resolveActualBillingModelId(provider),
            customGroups: customApiGroups,
            pool: pool ?? undefined,
            skipInsert: pool == null,
            mainUsedPlatformCredentials: pool != null,
          },
          () =>
            streamDocument({
              send,
              id: documentId,
              request,
              model,
              signal,
              timeoutMs,
              secrets,
            }),
        );
      } catch (err) {
        logSatelliteError("/api/document", err);
        send({
          type: "document",
          id: documentId,
          status: "error",
          message: toChatErrorMessage(err, secrets),
        });
      } finally {
        clearInterval(pingTimer);
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

export const POST = withPaidRequest(handlePOST, "/api/document");
