import { getModelInfo, DEFAULT_IMAGE_MODEL_ID, CUSTOM_PREFIX, findCustomModelGroup, type CustomApiGroup } from "@/lib/ai/models";

import { assertSafeCustomBaseUrl } from "@/lib/ai/customBaseUrl";
import { normalizeOpenAIBaseUrl } from "@/lib/ai/openaiBaseUrl";
import { overlayOptional, resolveCapabilityEndpoint, type CapabilityEndpoints } from "@/lib/ai/capabilityEndpoints";
import type { ResolvedImageProvider } from "./types";
import { safeNormalizedCustomBaseUrl, normalizeImageApiStyle } from "./protocol";
import { credentialsFor } from "./credentials";
export function applyUserImageEndpoint(
  platform: ResolvedImageProvider,
  capability?: CapabilityEndpoints | null,
): ResolvedImageProvider {
  if (!capability) return platform;
  const resolved = resolveCapabilityEndpoint({
    userBaseUrl: capability.imageBaseUrl,
    userApiKey: capability.imageApiKey,
    platformBaseUrl: platform.baseUrl,
    platformApiKey: platform.apiKey,
  });
  let baseUrl = resolved.baseUrl;
  if (resolved.customBaseUrl) {
    baseUrl = normalizeOpenAIBaseUrl(assertSafeCustomBaseUrl(baseUrl));
  }
  const apiModelId = overlayOptional(capability.imageModelId, platform.apiModelId);
  const imageApiStyle = capability.imageApiStyle !== "auto"
    ? capability.imageApiStyle
    : platform.imageApiStyle;
  return {
    ...platform,
    baseUrl,
    apiKey: resolved.apiKey,
    apiModelId,
    configured: !!(baseUrl && resolved.apiKey && !baseUrl.includes("your-endpoint")),
    isCustom: platform.isCustom || !resolved.usedPlatformCredentials,
    imageApiStyle,
  };
}

/**
 * 解析生图模型 provider。
 * 优先级：defaultImageModelId 指向的自定义生图模型 > 内置硅基流动生图模型。
 */
export function resolveImageProvider(
  modelId: string,
  customGroups?: CustomApiGroup[] | null,
  defaultImageModelId?: string | null,
  capability?: CapabilityEndpoints | null,
): ResolvedImageProvider {
  const selectedCustom = modelId.startsWith(CUSTOM_PREFIX) && customGroups?.length
    ? findCustomModelGroup(customGroups, modelId)
    : undefined;
  const selectedIsImage =
    selectedCustom?.model.type === "image" || getModelInfo(modelId)?.type === "image";

  // 用户明确选中生图模型时必须使用该模型；默认生图模型只在当前模型不是生图模型时兜底。
  const effectiveModelId = selectedIsImage ? modelId : (defaultImageModelId || modelId);

  // 2. 如果是自定义模型，在分组中查找
  if (effectiveModelId.startsWith(CUSTOM_PREFIX) && customGroups && customGroups.length > 0) {
    const found = findCustomModelGroup(customGroups, effectiveModelId);
    if (found && found.group.baseUrl?.trim() && found.group.apiKey?.trim()) {
      return {
        baseUrl: safeNormalizedCustomBaseUrl(found.group.baseUrl),
        apiKey: found.group.apiKey.trim(),
        apiModelId: found.model.id,
        registryId: effectiveModelId,
        configured: true,
        isCustom: true,
        imageApiStyle: normalizeImageApiStyle(found.model.imageApiStyle),
      };
    }
  }

  // 3. 内置生图模型 → 按该模型的 provider 取凭证（设置里自配的生图端点可覆盖）
  const info = getModelInfo(effectiveModelId);
  if (info && info.type === "image") {
    const endpoint = info.endpoints[0];
    const cred = credentialsFor(endpoint?.provider ?? "siliconflow");
    return applyUserImageEndpoint({
      baseUrl: cred.baseUrl,
      apiKey: cred.apiKey,
      apiModelId: endpoint?.apiModelId ?? effectiveModelId,
      registryId: effectiveModelId,
      configured: cred.configured,
      isCustom: false,
      // 显式声明优先：xhuoai 的 nano-banana 名字不像 gpt-image，按名字猜会发错协议。
      imageApiStyle: normalizeImageApiStyle(info.imageApiStyle),
    }, capability);
  }

  // 4. 回退：默认生图模型（廉价快速通道 baidu/ERNIE-Image-Turbo + 它自己的供应商凭证）
  const fallbackInfo = getModelInfo(DEFAULT_IMAGE_MODEL_ID);
  const fallbackEndpoint = fallbackInfo?.endpoints[0];
  const cred = credentialsFor(fallbackEndpoint?.provider ?? "siliconflow");
  const fallbackId = overlayOptional(capability?.imageModelId, DEFAULT_IMAGE_MODEL_ID);
  return applyUserImageEndpoint({
    baseUrl: cred.baseUrl,
    apiKey: cred.apiKey,
    apiModelId: overlayOptional(capability?.imageModelId, fallbackEndpoint?.apiModelId ?? DEFAULT_IMAGE_MODEL_ID),
    registryId: fallbackId,
    configured: cred.configured,
    isCustom: false,
    imageApiStyle: normalizeImageApiStyle(fallbackInfo?.imageApiStyle),
  }, capability);
}

/**
 * 生图请求的上游超时（毫秒）。
 * 为什么必须按模型分开：xhuoai 的 nano-banana / gpt-image-* 实测 49s 起、常见 100–400s，
 * 一刀 180s 会把慢模型稳定判成超时。缺省 180s 保持历史行为。
 */
export function getImageTimeoutMs(registryId: string): number {
  const info = getModelInfo(registryId);
  return info?.imageTimeoutMs ?? 180_000;
}