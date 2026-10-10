import { CUSTOM_PREFIX, THINKING_EFFORT_VALUES, buildCustomModelRegistryId, normalizeThinkingLevels, resolveCacheTtlSec, type CustomApiGroup, type CustomModelConfig, type ThinkingEffort, type ModelInfo } from "./contracts";
import { MODELS, getModelInfo } from "./catalog";
import { modelsForPicker } from "./selection";
/**
 * 本次请求真正会用到的自定义分组（0 或 1 个，偶发两个：生图默认模型兜底）。
 * 内置模型（含 custom-openai）不匹配任何分组，返回 []。
 */
export function selectCustomApiGroupsForRequest(
  groups: CustomApiGroup[],
  ...modelIds: Array<string | null | undefined>
): CustomApiGroup[] {
  if (!groups.length) return [];
  const seen = new Set<string>();
  const selected: CustomApiGroup[] = [];
  for (const modelId of modelIds) {
    if (!modelId) continue;
    const found = findCustomModelGroup(groups, modelId);
    if (!found || seen.has(found.group.id)) continue;
    seen.add(found.group.id);
    selected.push(found.group);
  }
  return selected;
}

/** 有模型信息时必须显式 vision:true 才接受图片；未知 id 不拦截。 */
export function modelAcceptsImageInput(id: string, groups: CustomApiGroup[]): boolean {
  const info = getModelInfoWithCustom(id, groups);
  if (!info) return true;
  return info.vision === true;
}


/** 在分组中查找包含某模型的分组（custom: 前缀）。 */
export function findCustomModelGroup(
  groups: CustomApiGroup[],
  modelId: string,
): { group: CustomApiGroup; model: CustomModelConfig } | undefined {
  const rawId = modelId.startsWith(CUSTOM_PREFIX) ? modelId.slice(CUSTOM_PREFIX.length) : modelId;
  for (const group of groups) {
    const encodedGroupId = encodeURIComponent(group.id);
    const scopedPrefix = `${encodedGroupId}:`;
    if (!rawId.startsWith(scopedPrefix)) continue;
    const encodedModelId = rawId.slice(scopedPrefix.length);
    let scopedModelId = encodedModelId;
    try {
      scopedModelId = decodeURIComponent(encodedModelId);
    } catch {
      // Keep the raw value as a best-effort fallback for malformed historical data.
    }
    const model = group.models.find((m) => m.id === scopedModelId);
    if (model) return { group, model };
  }

  for (const group of groups) {
    const model = group.models.find((m) => m.id === rawId);
    if (model) return { group, model };
  }
  return undefined;
}

export function normalizeCustomModelRegistryId(modelId: string, groups: CustomApiGroup[]): string {
  if (!modelId.startsWith(CUSTOM_PREFIX)) return modelId;

  const found = findCustomModelGroup(groups, modelId);
  if (!found) return modelId;

  const canonical = buildCustomModelRegistryId(found.group.id, found.model.id);
  const rawId = modelId.slice(CUSTOM_PREFIX.length);
  const scopedPrefix = `${encodeURIComponent(found.group.id)}:`;
  if (rawId.startsWith(scopedPrefix)) return canonical;

  const legacyMatches = groups.flatMap((group) =>
    group.models
      .filter((model) => model.id === rawId)
      .map((model) => ({ group, model })),
  );

  return legacyMatches.length === 1 ? canonical : modelId;
}

function customThinkingLevels(c: CustomModelConfig): ThinkingEffort[] | undefined {
  if (!c.thinking) return undefined;
  if (c.thinkingLevels === undefined) return [...THINKING_EFFORT_VALUES];
  const levels = normalizeThinkingLevels(c.thinkingLevels);
  return levels.length > 0 ? levels : undefined;
}

function customDefaultEffort(c: CustomModelConfig, levels: ThinkingEffort[] | undefined): ThinkingEffort | undefined {
  if (!c.thinking || !levels?.length) return undefined;
  if (c.defaultThinkingEffort && levels.includes(c.defaultThinkingEffort)) return c.defaultThinkingEffort;
  if (levels.includes("medium")) return "medium";
  return levels[0];
}

/** 将单个 CustomModelConfig 转换为 ModelInfo（内部辅助）。 */
function customModelToInfo(
  c: CustomModelConfig,
  group: Pick<CustomApiGroup, "id" | "name" | "timeoutMs">,
  options?: { scopedId?: boolean },
): ModelInfo {
  const isImage = c.type === "image";
  const thinking = c.thinking ?? false;
  const levels = customThinkingLevels(c);
  const timeoutMs = c.timeoutMs ?? group.timeoutMs;
  return {
    id: options?.scopedId === false ? CUSTOM_PREFIX + c.id : buildCustomModelRegistryId(group.id, c.id),
    label: c.label || c.id,
    group: group.name || "自定义 API",
    thinking,
    thinkingLevels: levels,
    thinkingRequired: thinking ? !!c.thinkingRequired : undefined,
    thinkingEffortMap: c.thinkingEffortMap,
    defaultThinkingEffort: customDefaultEffort(c, levels),
    thinkingRequestStyle: c.thinkingRequestStyle,
    tools: c.tools ?? (isImage ? false : true),
    vision: c.vision,
    contextK: c.contextK ?? 128,
    hint: isImage ? `${c.id} · 生图模型` : c.id,
    // 自定义分组没有内置 endpoints 链；凭证走分组 baseUrl/apiKey，不支持 failover。
    endpoints: [],
    pricing: c.pricing
      ? {
          input: c.pricing.input,
          cachedInput: c.pricing.cachedInput ?? c.pricing.input,
          cacheWrite: c.pricing.cacheWrite ?? c.pricing.cachedInput ?? c.pricing.input,
          output: c.pricing.output,
        }
      : undefined,
    cacheTtlSec: resolveCacheTtlSec(c.cacheTtlSec),
    timeoutMs: typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    type: c.type ?? "text",
    imageParams: c.imageParams,
  };
}

/** 合并内置模型 + 自定义模型，供菜单和 getModelInfo 使用。 */
export function getAllModels(groups: CustomApiGroup[]): ModelInfo[] {
  const custom: ModelInfo[] = groups.flatMap((g) =>
    g.models.map((c) => customModelToInfo(c, g)),
  );
  return [...modelsForPicker(MODELS), ...custom];
}

/** 向后兼容：接收 CustomModelConfig[] 的旧版 getAllModels。 */
export function getAllModelsFlat(customModels: CustomModelConfig[]): ModelInfo[] {
  return [
    ...modelsForPicker(MODELS),
    ...customModels.map((c) =>
      customModelToInfo(c, { id: "legacy", name: "自定义 API" }, { scopedId: false }),
    ),
  ];
}

/** 查找模型信息，支持自定义模型（custom: 前缀）。 */
export function getModelInfoWithCustom(id: string, groups: CustomApiGroup[]): ModelInfo | undefined {
  if (id.startsWith(CUSTOM_PREFIX)) {
    const found = findCustomModelGroup(groups, id);
    if (!found) return undefined;
    return customModelToInfo(found.model, found.group);
  }
  return getModelInfo(id);
}

/** 按 group 聚合（含自定义模型），保持声明顺序。 */
export function getModelGroupsWithCustom(groups: CustomApiGroup[]): { group: string; models: ModelInfo[] }[] {
  const all = getAllModels(groups);
  const order: string[] = [];
  const map = new Map<string, ModelInfo[]>();
  for (const m of all) {
    if (!map.has(m.group)) {
      map.set(m.group, []);
      order.push(m.group);
    }
    map.get(m.group)!.push(m);
  }
  return order.map((group) => ({ group, models: map.get(group)! }));
}
