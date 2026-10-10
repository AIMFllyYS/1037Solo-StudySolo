import { getModelInfo, getLandedModelInfo, getFetchTimeoutMs, CUSTOM_OPENAI_MODEL_ID } from "@/lib/ai/models";

import { relayModelConfig } from "@/lib/ai/endpoints/relayConfig";
import { AUTO_MODEL_ID } from "@/lib/ai/models";

import type { ResolvedProvider } from "./types";
import { ENV_MODEL_FLASH, credentialsFor, RELAY_MODEL_ID, REASONING_FIELD } from "./credentials";
export function resolveBuiltinEndpoint(
  registryId: string,
  endpointIndex: number,
): ResolvedProvider {
  if (registryId === AUTO_MODEL_ID) throw new Error("自动模型必须先由服务端完成路由。");
  const info = getModelInfo(registryId);
  const fallbackId = ENV_MODEL_FLASH;
  const effectiveId = info ? registryId : fallbackId;
  const effectiveInfo = info ?? getModelInfo(fallbackId);
  const endpoints = effectiveInfo?.endpoints ?? [];
  const idx = endpoints.length > 0 ? Math.min(endpointIndex, endpoints.length - 1) : 0;
  const endpoint = endpoints[idx];
  const cred = endpoint ? credentialsFor(endpoint.provider) : credentialsFor("siliconflow");
  const isCustomOpenai = effectiveId === CUSTOM_OPENAI_MODEL_ID;
  const relay = endpoint?.provider === "relay" && !isCustomOpenai ? relayModelConfig(effectiveId) : undefined;
  const apiModelId = isCustomOpenai
    ? (RELAY_MODEL_ID || endpoint?.apiModelId || effectiveId)
    : (relay?.apiModelId ?? endpoint?.apiModelId ?? effectiveId);
  // custom-openai 的 apiModelId 是用户填的 RELAY_MODEL_ID，可能撞上内置 id；
  // 思考方言仍跟注册条目，与 hop 0 历史行为一致。其余 hop 按落地 apiModelId 取。
  const landedInfo = getLandedModelInfo(isCustomOpenai ? effectiveId : apiModelId, effectiveId)
    ?? effectiveInfo;

  return {
    billingProvider: endpoint?.provider ?? "siliconflow",
    registryId: effectiveId,
    apiModelId,
    baseUrl: cred.baseUrl,
    apiKey: cred.apiKey,
    reasoningField: REASONING_FIELD,
    thinkingRequestStyle: relay?.thinkingRequestStyle ?? landedInfo?.thinkingRequestStyle ?? "siliconflow",
    gatewayDefaults: !!relay,
    ...(relay?.temperature !== undefined ? { temperature: relay.temperature } : {}),
    apiProtocol: "openai",
    isCustom: false,
    configured: isCustomOpenai ? cred.configured && !!RELAY_MODEL_ID : cred.configured && relay?.enabled !== false,
    endpointIndex: idx,
    timeoutMs: getFetchTimeoutMs(effectiveId),
  };
}