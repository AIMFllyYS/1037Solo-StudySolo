import { billableJsonFetch } from "@/lib/billing/billableFetch";
import { withPaidRequest } from "@/lib/billing/paidRequest";
import { after, type NextRequest } from "next/server";
import { Agent } from "undici";
import {
  resolveImageProvider,
  imagesGenerationsUrl,
  detectImageApiStyle,
  getImageTimeoutMs,
  type ResolvedImageProvider,
} from "@/lib/ai/provider";
import { UnsafeCustomBaseUrlError } from "@/lib/ai/customBaseUrl";
import { capabilitySecretValues, normalizeCapabilityEndpoints } from "@/lib/ai/capabilityEndpoints";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { collectRequestSecrets, formatRequestError, parseImageGenRequest } from "@/lib/ai/agent/requestSchema";
import { logSatelliteError } from "@/lib/ai/observability/agentLog";
import { normalizeImageGenImages } from "@/lib/ai/imageGenResponse";
import { settleUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, quotaRejectedJson, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 慢模型中转站（xhuoai 的 nano-banana / gpt-image-*）实测 26–49s、常见到 100–400s，
// 单模型超时见 ModelInfo.imageTimeoutMs（最长 420s）。这里给函数级上限留足余量。
export const maxDuration = 600;

// Node の fetch（undici）は headersTimeout/bodyTimeout がデフォルト 300s のため、
// 300–420s に収まる正常な生图も socket 層で切断され UND_ERR_HEADERS_TIMEOUT になっていた。
// 上游制限は下の AbortController（imageTimeoutMs）に一本化し、undici 側の二重タイムアウトは無効化する。
const imageGenDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * 根据 apiModelId 判断生图 API 风格。
 * - OpenAI 官方生图模型（gpt-image-*, dall-e-*）走 OpenAI Image API 标准：
 *   请求体用 size/n，响应为 { data: [{url|b64_json}] }，gpt-image-1 只返回 b64_json。
 * - 其他模型（如 SiliconFlow 的 Z-Image-Turbo）走 SiliconFlow 风格：
 *   请求体用 image_size/batch_size，响应为 { images: [{url}] }。
 */

function jsonError(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status });
}

async function handlePOST(req: NextRequest) {
  let body: ReturnType<typeof parseImageGenRequest>;
  try {
    body = parseImageGenRequest(await req.json().catch(() => ({})));
  } catch (err) {
    return jsonError(400, formatRequestError(err), "bad_request");
  }
  const modelId = typeof body.modelId === "string" ? body.modelId : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const size = typeof body.size === "string" ? body.size : "1024x1024";
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 4);
  const customGroups = body.customApiGroups;
  const defaultImageModelId =
    typeof body.defaultImageModelId === "string" ? body.defaultImageModelId : null;
  const capability = normalizeCapabilityEndpoints(body.capabilityEndpoints);
  const probe = body.probe === true;

  if (!probe && !prompt.trim()) {
    return jsonError(400, "缺少生图提示词", "bad_request");
  }

  let provider: ResolvedImageProvider;
  try {
    provider = resolveImageProvider(modelId, customGroups, defaultImageModelId, capability);
  } catch (err) {
    if (err instanceof UnsafeCustomBaseUrlError) {
      return jsonError(400, "生图端点不对：自定义地址不安全或协议不受支持", "bad_endpoint");
    }
    throw err;
  }

  const secrets = [
    ...collectRequestSecrets({ customApiGroups: customGroups }),
    ...capabilitySecretValues(capability),
    provider.apiKey,
  ].filter((value): value is string => !!value);

  if (!provider.configured) {
    return jsonError(
      500,
      "生图 API 未配置，请在设置中填写生图端点，或在 .env.local 配置 SILICONFLOW_BASE_URL / SILICONFLOW_API_KEY。",
      "unconfigured",
    );
  }

  if (probe) {
    return Response.json({
      ok: true,
      code: "ok",
      message: "生图端点已配置（未实际上游出图）",
      isCustom: provider.isCustom,
    });
  }

  const pool = resolveMainModelPool(
    usedPlatformCredentialsForProvider({ isCustom: provider.isCustom, registryId: provider.registryId }),
  );
  // BYOK（pool=null）は额度確認も settle の insert も使わないため、userId 解決の外部呼び出し自体を省く。
  const userId = pool == null ? null : await resolveQuotaUserId(req.headers);
  const gate = await assertQuotaAvailable({ userId, pool });
  if (!gate.ok) return quotaRejectedJson(gate);

  const endpoint = imagesGenerationsUrl(provider.baseUrl);
  const apiStyle = detectImageApiStyle(provider.apiModelId, provider.imageApiStyle);

  // 构造请求体：OpenAI 风格用 size/n，SiliconFlow 风格用 image_size/batch_size。
  // gpt-image-1 不接受 response_format 字段（发送会 400），固定返回 b64_json；
  // dall-e-2/3 支持 response_format，统一请求 b64_json 避免 url 60 分钟过期。
  const requestBody: Record<string, unknown> = {
    model: provider.apiModelId,
    prompt: prompt.trim(),
  };

  if (apiStyle === "openai") {
    requestBody.n = count;
    requestBody.size = size;
    if (/^dall-e/i.test(provider.apiModelId)) {
      requestBody.response_format = "b64_json";
    }
    // gpt-image-1 默认返回 b64_json，无需 response_format
  } else {
    requestBody.image_size = size;
    requestBody.batch_size = count;
  }

  const abortCtrl = new AbortController();
  // 按模型取上游超时：慢速中转站要放到 420s，廉价通道 90s；缺省仍是历史的 180s。
  const upstreamTimeoutMs = getImageTimeoutMs(provider.registryId);
  const timeoutId = setTimeout(() => abortCtrl.abort(), upstreamTimeoutMs);

  try {
    const res = await billableJsonFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortCtrl.signal,
      dispatcher: imageGenDispatcher,
    } as RequestInit, { model: provider.registryId, kind: "image", byok: provider.isCustom, quantity: count, actualUnits: data => normalizeImageGenImages(data).length });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logSatelliteError("/api/image-gen", { status: res.status, body: errText });
      if (res.status === 404) {
        return jsonError(502, "生图端点不对（上游返回 404）", "bad_endpoint");
      }
      if (res.status === 401 || res.status === 403) {
        return jsonError(502, "生图上游拒绝访问，请检查端点与密钥", "upstream_auth");
      }
      const upstreamErr = Object.assign(new Error("image generation failed"), { statusCode: res.status });
      return jsonError(502, toChatErrorMessage(upstreamErr, secrets), "upstream");
    }

    const data = await res.json().catch(() => null);
    if (!data) {
      return jsonError(500, "生图 API 返回格式异常", "bad_response");
    }

    const images = normalizeImageGenImages(data);
    if (images.length === 0) {
      return jsonError(500, "生图 API 未返回可用图片", "bad_response");
    }

    // usage（gpt-image-1 按 token 计费；dall-e 系列与 SiliconFlow 无此字段）
    let usage:
      | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      | undefined;
    if (data.usage && typeof data.usage === "object") {
      const u = data.usage as Record<string, unknown>;
      usage = {
        input_tokens: typeof u.input_tokens === "number" ? u.input_tokens : undefined,
        output_tokens: typeof u.output_tokens === "number" ? u.output_tokens : undefined,
        total_tokens: typeof u.total_tokens === "number" ? u.total_tokens : undefined,
      };
    }

    const settleInput = {
      headers: req.headers,
      userId,
      route: "/api/image-gen",
      kind: "image" as const,
      imageCount: images.length,
      selectedModelId: modelId || provider.registryId,
      actualModelId: provider.registryId,
      customGroups,
      pool: pool ?? undefined,
      skipInsert: pool == null,
      rawUsage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }
        : undefined,
      meta: { source: "image-gen" },
    };
    // 写库は応答のクリティカルパスから外す。リクエストスコープ外（単体テストの直接呼び出し）
    // では after が登録できないため、その場で非同期に流す。
    try {
      after(async () => {
        await settleUsage(settleInput);
      });
    } catch {
      void settleUsage(settleInput);
    }

    return Response.json({
      images,
      usage,
      seed: data.seed, // SiliconFlow 专用，OpenAI 无
      model: provider.apiModelId,
      registryId: provider.registryId,
      isCustom: provider.isCustom,
      apiStyle,
    });
  } catch (err) {
    logSatelliteError("/api/image-gen", err);
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (isAbort) {
      return jsonError(500, "生图超时，请重试", "timeout");
    }
    const chain = err && typeof err === "object" ? (err as { code?: unknown; cause?: { code?: unknown } }) : {};
    const code = typeof chain.code === "string" ? chain.code : typeof chain.cause?.code === "string" ? chain.cause.code : "";
    const looksLikeEndpoint = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|Failed to parse URL/i.test(code)
      || /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|Failed to parse URL/i.test(err instanceof Error ? err.message : "");
    if (looksLikeEndpoint) {
      return jsonError(502, "生图端点不对或无法连接，请检查设置中的 Base URL", "bad_endpoint");
    }
    return jsonError(500, toChatErrorMessage(err, secrets), "upstream");
  } finally {
    // headers 到着後も body 読み取り中は同じ AbortController で締めるため、必ず最後に解除する。
    clearTimeout(timeoutId);
  }
}

export const POST = withPaidRequest(handlePOST, "/api/image-gen");
