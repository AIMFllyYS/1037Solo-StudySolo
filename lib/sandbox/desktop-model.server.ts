import { buildCustomModelRegistryId, getModelInfo, CUSTOM_OPENAI_MODEL_ID, type CustomApiGroup } from "@/lib/ai/models";
import { assertSafeCustomBaseUrl } from "@/lib/ai/endpoints/customBaseUrl";

/** Preserve keys the desktop user explicitly entered; never copy operator env. */
export function desktopModelRequest(body: Record<string, unknown>, env: Partial<NodeJS.ProcessEnv> = process.env) {
  const custom = body.customProvider && typeof body.customProvider === "object" ? body.customProvider as Record<string, unknown> : undefined;
  if (Array.isArray(body.customApiGroups) && body.customApiGroups.length || typeof custom?.baseUrl === "string" && custom.baseUrl.trim() && typeof custom.apiKey === "string" && custom.apiKey.trim()) return body;
  const selected = typeof body.modelId === "string" ? body.modelId : env.AI_MODEL_FLASH ?? "z-ai/glm-5.3-flash";
  const model = getModelInfo(selected), endpoint = model?.endpoints[0];
  const credentials = endpoint?.provider === "relay" ? { key: env.RELAY_API_KEY, base: env.RELAY_BASE_URL }
    : endpoint?.provider === "siliconflow" ? { key: env.AI_API_KEY, base: "https://api.siliconflow.cn/v1" }
    : endpoint?.provider === "mimo" ? { key: env.MIMO_API_KEY, base: env.MIMO_BASE_URL ?? "https://token-plan-cn.xiaomimimo.com/v1" }
    : endpoint?.provider === "zhipu" ? { key: env.ZHIPU_API_KEY, base: "https://open.bigmodel.cn/api/paas/v4" } : undefined;
  if (!credentials?.key?.trim() || !credentials.base?.trim()) return body;
  const apiModelId = selected === CUSTOM_OPENAI_MODEL_ID ? env.RELAY_MODEL_ID?.trim() : endpoint?.apiModelId;
  if (!apiModelId) return body;
  assertSafeCustomBaseUrl(credentials.base);
  const group: CustomApiGroup = { id: "desktop-owned-model", name: "Desktop configured provider", baseUrl: credentials.base, apiKey: credentials.key, models: [{ id: apiModelId, label: model?.label ?? apiModelId, tools: model?.tools ?? true, vision: model?.vision, contextK: model?.contextK, thinking: model?.thinking, thinkingLevels: model?.thinkingLevels, thinkingRequired: model?.thinkingRequired, thinkingEffortMap: model?.thinkingEffortMap, apiProtocol: "openai", thinkingRequestStyle: endpoint?.provider === "relay" ? "openai-reasoning-effort" : model?.thinkingRequestStyle }] };
  return { ...body, modelId: buildCustomModelRegistryId(group.id, apiModelId), customApiGroups: [group] };
}
