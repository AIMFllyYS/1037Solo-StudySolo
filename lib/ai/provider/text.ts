import { getModelInfo, hasNextEndpoint, normalizeRegistryId, isCustomRegistryId, CUSTOM_PREFIX, buildCustomModelRegistryId, findCustomModelGroup, type CustomApiGroup, type CustomApiProtocol } from "@/lib/ai/models";
import { DEFAULT_CHAT_TIMEOUT_MS } from "@/lib/ai/upstream";

import type { CustomProvider, ResolvedProvider } from "./types";
import { inferProtocolFromLegacy, autoConfigFromProtocol, safeNormalizedCustomBaseUrl, normalizeThinkingRequestStyle, customTimeoutMs } from "./protocol";
import { REASONING_FIELD, ENV_MODEL_FLASH } from "./credentials";
import { resolveBuiltinEndpoint } from "./builtin";
export function resolveProvider(
  modelId: string | undefined,
  custom?: CustomProvider | CustomApiGroup[] | null,
  endpointIndex = 0,
): ResolvedProvider {
  const isCustomModel =
    modelId === "custom" || (modelId?.startsWith(CUSTOM_PREFIX) ?? false);

  // 新版：custom 为 CustomApiGroup[] 时，在分组中查找模型
  if (isCustomModel && Array.isArray(custom) && custom.length > 0) {
    const found = findCustomModelGroup(custom, modelId ?? "");
    if (found && found.group.baseUrl?.trim() && found.group.apiKey?.trim()) {
      const registryId = modelId?.startsWith(CUSTOM_PREFIX)
        ? buildCustomModelRegistryId(found.group.id, found.model.id)
        : CUSTOM_PREFIX + found.model.id;
      // 三选一协议：优先取用户显式选择，否则从旧字段推断（向后兼容）。
      const apiProtocol: CustomApiProtocol = found.model.apiProtocol
        ?? inferProtocolFromLegacy(found.model.thinkingRequestStyle);
      const auto = autoConfigFromProtocol(apiProtocol);
      return {
        registryId,
        apiModelId: found.model.id,
        baseUrl: safeNormalizedCustomBaseUrl(found.group.baseUrl),
        apiKey: found.group.apiKey.trim(),
        // 用户显式填的 override 优先；否则用协议默认。
        reasoningField: found.model.reasoningField?.trim() || auto.reasoningField,
        thinkingRequestStyle: normalizeThinkingRequestStyle(
          found.model.thinkingRequestStyle,
          found.model.thinking ? auto.thinkingRequestStyle : "none",
        ),
        apiProtocol,
        isCustom: true,
        configured: true,
        endpointIndex: 0,
        timeoutMs: customTimeoutMs(found.model.timeoutMs, found.group.timeoutMs),
      };
    }
  }

  if (isCustomModel && Array.isArray(custom) && modelId?.startsWith(CUSTOM_PREFIX)) {
    throw new Error('当前自定义模型的分组、地址或密钥不可用。请检查 API 设置或恢复旧配置，本次不会改用平台模型。');
  }

  // 旧版兼容：custom 为 CustomProvider 对象
  const customProvider =
    custom && !Array.isArray(custom) && (custom as CustomProvider).baseUrl
      ? (custom as CustomProvider)
      : undefined;
  const customModelName = modelId?.startsWith(CUSTOM_PREFIX)
    ? modelId.slice(CUSTOM_PREFIX.length)
    : customProvider?.model;

  if (
    isCustomModel &&
    customProvider?.baseUrl?.trim() &&
    customProvider?.apiKey?.trim() &&
    customModelName?.trim()
  ) {
    const registryId = modelId?.startsWith(CUSTOM_PREFIX)
      ? modelId
      : CUSTOM_PREFIX + customModelName.trim();
    return {
      registryId,
      apiModelId: customModelName.trim(),
      baseUrl: safeNormalizedCustomBaseUrl(customProvider.baseUrl),
      apiKey: customProvider.apiKey.trim(),
      reasoningField: REASONING_FIELD,
      thinkingRequestStyle: "siliconflow",
      apiProtocol: "openai",
      isCustom: true,
      configured: true,
      endpointIndex: 0,
      timeoutMs: DEFAULT_CHAT_TIMEOUT_MS,
    };
  }

  const registryId = normalizeRegistryId(
    modelId && modelId !== "custom" && !(modelId?.startsWith(CUSTOM_PREFIX) ?? false)
      ? modelId
      : ENV_MODEL_FLASH,
  );

  return resolveBuiltinEndpoint(registryId, endpointIndex);
}

/**
 * 取「这次请求真正该从哪一跳开始」的 provider：链首没配凭证时自动往后找第一个配好的端点。
 *
 * 为什么必须有这一步：七牛云现在是 DeepSeek / Qwen / GLM 的**第一跳**。如果部署时没填
 * QINIU_API_KEY，链首就是"未配置"（apiKey 为空），请求会以空 Bearer 打出去拿到 401，
 * 而 401/403/429 属于**不降级**错误（见 failoverModel 的 recoverable 规则）——结果是所有
 * 对话请求硬失败，而不是安静退到 Protocom。这里把"没配"和"上游挂了"区分开。
 *
 * 全链都没配置时返回链首，保留原有的"未配置"报错语义（路由会给出可读提示）。
 */
export function resolveEntryProvider(
  registryId: string | undefined,
  custom?: CustomProvider | CustomApiGroup[] | null,
): ResolvedProvider {
  const first = resolveProvider(registryId, custom, 0);
  if (first.configured || isCustomRegistryId(first.registryId)) return first;
  const endpointCount = getModelInfo(first.registryId)?.endpoints.length ?? 0;
  for (let index = 1; index < endpointCount; index += 1) {
    const candidate = resolveProvider(registryId, custom, index);
    if (candidate.configured) return candidate;
  }
  return first;
}

/**
 * 该模型是否至少有一个可用端点。
 *
 * 与 resolveProvider(id).configured 的区别：链首没配凭证但后面的跳配好时，这里返回 true
 * —— 因为 resolveEntryProvider 会让请求直接从那一跳起步，模型实际是可用的。
 * 自动路由的候选过滤必须用这个口径，否则"没填七牛云 key"会把 DeepSeek / GLM 整体误判为不可用。
 */
export function isProviderAvailable(
  registryId: string,
  custom?: CustomProvider | CustomApiGroup[] | null,
): boolean {
  return resolveEntryProvider(registryId, custom).configured;
}

/** 切换到 endpoints 链中的下一端点；无备用或凭证未配置时返回 null。 */
export function resolveNextProvider(
  registryId: string,
  currentEndpointIndex: number,
  custom?: CustomProvider | CustomApiGroup[] | null,
): ResolvedProvider | null {
  if (!hasNextEndpoint(registryId, currentEndpointIndex)) return null;
  const next = resolveProvider(registryId, custom, currentEndpointIndex + 1);
  if (!next.configured) return null;
  return next;
}