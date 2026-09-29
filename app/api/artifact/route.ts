import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from "next/server";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { ARTIFACT_IDLE_TIMEOUT_MS, streamInteractiveArtifact } from "@/lib/ai/artifact";
import { collectRequestSecrets, formatRequestError, parseArtifactRequest } from "@/lib/ai/agent/requestSchema";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { defaultEffortFor, getModelInfoWithCustom } from "@/lib/ai/models";
import { resolveActualBillingModelId, withRequestLedger } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 自托管平台若读取该字段：给足深度思考 + 写 HTML 的时间。 */
export const maxDuration = 720;

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function handlePOST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  let body: ReturnType<typeof parseArtifactRequest>;
  try {
    body = parseArtifactRequest(raw);
  } catch (err) {
    const artifactId = String((raw as { id?: unknown })?.id ?? "");
    return new Response(sse({ type: "artifact", id: artifactId, status: "error", message: formatRequestError(err) }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }
  const artifactId = String(body.id ?? "");
  const title = String(body.title ?? "交互演示");
  const prompt = String(body.prompt ?? "");
  const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
  const customApiGroups = body.customApiGroups;
  const customProvider = body.customProvider;
  const secrets = collectRequestSecrets({ customApiGroups, customProvider });
  const resolved = resolveLanguageModel(
    modelId,
    customApiGroups.length > 0 ? customApiGroups : customProvider,
    { firstChunkTimeoutMs: ARTIFACT_IDLE_TIMEOUT_MS },
  );
  const { model, provider } = resolved;
  if (provider.apiKey) secrets.push(provider.apiKey);
  const info = getModelInfoWithCustom(provider.registryId, customApiGroups);
  // 会思考的模型必须带思考参数（尤其 thinkingRequired），并给 12 分钟滑动超时。
  const thinking = resolved.supportsThinking
    ? resolved.thinkingSettings(defaultEffortFor(info))
    : undefined;
  const timeoutMs = ARTIFACT_IDLE_TIMEOUT_MS;

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
        if (!artifactId) {
          send({ type: "artifact", id: "", status: "error", message: "缺少 artifact id" });
          return;
        }
        if (modelId && getModelInfoWithCustom(modelId, customApiGroups)?.type === "image") {
          send({
            type: "artifact",
            id: artifactId,
            status: "error",
            message: "当前生图模型不支持 HTML 交互组件生成，请切换文本模型后重试。",
          });
          return;
        }
        if (!provider.configured) {
          send({
            type: "artifact",
            id: artifactId,
            status: "error",
            message: "AI 暂未配置，请先配置 AI_BASE_URL / AI_API_KEY 或自定义模型。",
          });
          return;
        }

        const userId = await resolveQuotaUserId(req.headers);
        const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
        const gate = await assertQuotaAvailable({ userId, pool });
        if (!gate.ok) {
          send({ type: "artifact", id: artifactId, status: "error", message: gate.error });
          return;
        }

        await withRequestLedger(
          req.headers,
          {
            route: "/api/artifact",
            selectedModelId: modelId ?? provider.registryId,
            actualModelId: resolveActualBillingModelId(provider),
            customGroups: customApiGroups,
            pool: pool ?? undefined,
            skipInsert: pool == null,
            mainUsedPlatformCredentials: pool != null,
          },
          () =>
            streamInteractiveArtifact({
              send,
              artifactId,
              args: { title, prompt },
              provider,
              model,
              signal,
              timeoutMs,
              thinking,
            }),
        );
      } catch (err) {
        logSatelliteError("/api/artifact", err);
        send({
          type: "artifact",
          id: artifactId,
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

export const POST = withPaidRequest(handlePOST, "/api/artifact");
