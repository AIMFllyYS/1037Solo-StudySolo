import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODELS,
  CUSTOM_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_CACHE_TTL_SEC,
  resolveCacheTtlSec,
  CUSTOM_OPENAI_MODEL_ID,
  LEGACY_REGISTRY_ALIASES,
  getModelInfo,
  getLandedModelInfo,
  getModelGroups,
  getModelGroupsWithCustom,
  getAllModels,
  getModelInfoWithCustom,
  normalizeThinkingLevels,
  THINKING_EFFORT_VALUES,
  type ThinkingEffort,
  getAllModelsFlat,
  buildCustomModelRegistryId,
  findCustomModelGroup,
  hasNextEndpoint,
  selectCustomApiGroupsForRequest,
  modelAcceptsImageInput,
  isCustomRegistryId,
  normalizeCustomModelRegistryId,
  primaryProvider,
  modelSupportsThinkingEffort,
  modelAllowsDisableThinking,
  clampThinkingEffort,
  wireThinkingEffort,
  modelMenuCategories,
  declaredMaxOutputTokens,
  FALLBACK_MAX_OUTPUT_TOKENS,
} from "./models.ts";
import { getMaxTokens } from "@/lib/context/types.ts";

test("缓存命中默认 5 分钟，计费按此", () => {
  assert.equal(DEFAULT_CACHE_TTL_SEC, 300);
  assert.equal(resolveCacheTtlSec(undefined), 300);
  assert.equal(resolveCacheTtlSec(0), 300);
  const withTtl = MODELS.filter((m) => m.cacheTtlSec != null);
  assert.ok(withTtl.length > 0);
  for (const m of withTtl) {
    assert.equal(m.cacheTtlSec, DEFAULT_CACHE_TTL_SEC);
  }
});

test("MODELS 非空且每个模型有必需字段", () => {
  assert.ok(MODELS.length > 0);
  for (const m of MODELS) {
    assert.ok(m.id, "model id 非空");
    assert.ok(m.label, `model label 非空: ${m.id}`);
    assert.ok(m.group, `model group 非空: ${m.id}`);
    assert.ok(typeof m.thinking === "boolean", `thinking 是布尔: ${m.id}`);
    assert.ok(typeof m.tools === "boolean", `tools 是布尔: ${m.id}`);
    assert.ok(m.hint, `hint 非空: ${m.id}`);
    assert.ok(m.endpoints.length > 0, `endpoints 非空: ${m.id}`);
    for (const ep of m.endpoints) {
      assert.ok(ep.apiModelId, `apiModelId 非空: ${m.id}`);
    }
  }
});

test("CUSTOM_MODEL_ID 是 'custom'", () => {
  assert.equal(CUSTOM_MODEL_ID, "custom");
});

test("CUSTOM_OPENAI_MODEL_ID 在 MODELS 且为自由中转分组", () => {
  const m = getModelInfo(CUSTOM_OPENAI_MODEL_ID);
  assert.ok(m);
  assert.equal(m!.id, CUSTOM_OPENAI_MODEL_ID);
  assert.equal(m!.group, "自由中转");
  assert.equal(m!.label, "自由中转");
});

test("DEFAULT_MODEL_ID 存在于 MODELS", () => {
  const found = getModelInfo(DEFAULT_MODEL_ID);
  assert.ok(found, `DEFAULT_MODEL_ID ${DEFAULT_MODEL_ID} 应在 MODELS 中`);
  assert.equal(DEFAULT_MODEL_ID, "deepseek/deepseek-v4.1-flash");
});

test("getModelInfo：存在的 id 返回 ModelInfo", () => {
  const m = getModelInfo("z-ai/glm-5.3-flash");
  assert.ok(m);
  assert.equal(m!.id, "z-ai/glm-5.3-flash");
  // 七牛云排第一跳（延迟最低），Protocom 中转是容灾。
  assert.equal(primaryProvider(m!), "qiniu");
});

test("getModelInfo：不存在的 id 返回 undefined", () => {
  assert.equal(getModelInfo("nonexistent-model"), undefined);
});

test("getModelGroups：按 group 聚合且保持声明顺序，不展示桌面「自由中转」", () => {
  const groups = getModelGroups();
  assert.ok(groups.length > 0);
  for (const g of groups) {
    assert.ok(g.models.length > 0, `group ${g.group} 至少一个模型`);
    assert.notEqual(g.group, "自由中转");
    assert.ok(!g.models.some((m) => m.id === CUSTOM_OPENAI_MODEL_ID));
  }
  assert.deepEqual(groups.map((g) => g.group), ["快速模型", "多模态", "免费模型", "旗舰模型", "生图模型"]);
});

test("getModelGroups：菜单模型都被分组覆盖（不含桌面自由中转）", () => {
  const groups = getModelGroups();
  const totalModels = groups.reduce((sum, g) => sum + g.models.length, 0);
  assert.equal(totalModels, MODELS.filter((m) => m.id !== CUSTOM_OPENAI_MODEL_ID).length);
});

test("MODELS：model id 唯一", () => {
  const ids = new Set<string>();
  for (const m of MODELS) {
    assert.ok(!ids.has(m.id), `model id 重复: ${m.id}`);
    ids.add(m.id);
  }
});

test("MODELS：19 个菜单模型价格与 cacheWrite", () => {
  const picker = MODELS.filter((m) => m.id !== CUSTOM_OPENAI_MODEL_ID);
  assert.equal(picker.length, 19);
  const price = (id: string) => {
    const m = getModelInfo(id);
    assert.ok(m?.pricing, id);
    return m!.pricing!;
  };
  assert.deepEqual(price("deepseek/deepseek-v4.1-flash"), { input: 2, cachedInput: 0.04, output: 8 });
  assert.deepEqual(price("Qwen/Qwen3.7-Flash"), { input: 1.2, cachedInput: 0.24, output: 4.8 });
  assert.deepEqual(price("gpt-5.6-luna"), { input: 1.4, cachedInput: 0.14, cacheWrite: 1.75, output: 8.4 });
  assert.deepEqual(price("mimo-v2.6-flash"), { input: 1, cachedInput: 0.02, cacheWrite: 1, output: 2 });
  assert.deepEqual(price("mimo-v2.6-pro"), { input: 3, cachedInput: 0.025, cacheWrite: 3, output: 6 });
  assert.deepEqual(price("xiaomi/mimo-v2.6-pro-ultraspeed"), { input: 30, cachedInput: 0.25, cacheWrite: 30, output: 60 });
  assert.deepEqual(price("google/gemini-3.8-flash"), { input: 10.5, cachedInput: 1.05, output: 52.5 });
  assert.deepEqual(price("z-ai/glm-5.3-flash"), { input: 0.8, cachedInput: 0.23, output: 2.8 });
  assert.deepEqual(price("Qwen/Qwen3.8-Flash"), { input: 0.8, cachedInput: 0.1, output: 2.7 });
  assert.deepEqual(price("meta/muse-spark-1.3-contributor"), { input: 0.7, cachedInput: 0.014, output: 1.4 });
  assert.deepEqual(price("poolside/laguna-s-2.1-free"), { input: 0, cachedInput: 0, output: 0 });
  assert.deepEqual(price("inclusionai/ling-3.0-flash-sante:free"), { input: 0, cachedInput: 0, output: 0 });
  assert.deepEqual(price("gpt-5.6-sol"), { input: 35, cachedInput: 3.5, cacheWrite: 43.75, output: 210 });
  assert.deepEqual(price("kimi-k3"), { input: 7, cachedInput: 0.7, cacheWrite: 0, output: 35 });
  assert.deepEqual(price("Tongyi-MAI/Z-Image-Turbo"), { input: 0, cachedInput: 0, output: 0.1 });
  // 新增生图：廉价快速通道 + 慢速高价中转站
  assert.deepEqual(price("baidu/ERNIE-Image-Turbo"), { input: 0, cachedInput: 0, output: 0.11 });
  assert.deepEqual(price("nano-banana"), { input: 0, cachedInput: 0, output: 1 });
  assert.deepEqual(price("gpt-image-2.5"), { input: 0, cachedInput: 0, output: 1 });
  assert.deepEqual(price("gpt-image-2"), { input: 0, cachedInput: 0, output: 1 });
  assert.equal(getModelInfo("inclusionai/ling-3.0-flash-sante:free")?.label.includes(":free"), false);
});

/** MODELS.md §2 上下文 → registry contextK：1M→1000，1.05M→1050，256K→256。 */
const MODELS_MD_SECTION2_CONTEXT_K: Record<string, number> = {
  "deepseek/deepseek-v4.1-flash": 1000,
  "Qwen/Qwen3.7-Flash": 1000,
  "gpt-5.6-luna": 1000,
  "mimo-v2.6-flash": 1000,
  "mimo-v2.6-pro": 1000,
  "xiaomi/mimo-v2.6-pro-ultraspeed": 1000,
  "google/gemini-3.8-flash": 1000,
  "z-ai/glm-5.3-flash": 1000,
  "Qwen/Qwen3.8-Flash": 1000,
  "meta/muse-spark-1.3-contributor": 1000,
  "poolside/laguna-s-2.1-free": 256,
  "inclusionai/ling-3.0-flash-sante:free": 256,
  "gpt-5.6-sol": 1000,
  "kimi-k3": 1000,
};

test("MODELS：对话模型 contextK 对齐 MODELS.md §2，getMaxTokens 按千 token 放大", () => {
  const chatPicker = MODELS.filter((m) => m.id !== CUSTOM_OPENAI_MODEL_ID && m.type !== "image");
  assert.deepEqual(
    chatPicker.map((m) => m.id).sort(),
    Object.keys(MODELS_MD_SECTION2_CONTEXT_K).sort(),
  );
  for (const m of chatPicker) {
    const expectedK = MODELS_MD_SECTION2_CONTEXT_K[m.id];
    assert.equal(getModelInfo(m.id)?.contextK, expectedK, m.id);
    assert.equal(getMaxTokens(m.id), expectedK * 1000, m.id);
  }
  assert.equal(getMaxTokens("Qwen/Qwen3.7-Flash"), 1_000_000);
  assert.equal(getMaxTokens("poolside/laguna-s-2.1-free"), 256_000);
  assert.equal(getMaxTokens("inclusionai/ling-3.0-flash-sante:free"), 256_000);
  // 下架的 LongCat 通过别名平滑迁移到 Laguna（老设置里的 id 仍然可用）。
  assert.equal(getModelInfo("meituan/LongCat-2.0:free")?.id, "poolside/laguna-s-2.1-free");
  assert.equal(getMaxTokens("meituan/LongCat-2.0:free"), 256_000);
});

test("getAllModels：不同自定义 API 分组允许同名模型但 registry id 唯一", () => {
  const groups = [
    {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.example/v1",
      apiKey: "sk-a",
      models: [{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }],
    },
    {
      id: "local-proxy",
      name: "Local Proxy",
      baseUrl: "https://proxy.example/v1",
      apiKey: "sk-b",
      models: [{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }],
    },
  ];

  const custom = getAllModels(groups).filter((m) => m.id.includes("claude-sonnet-4-6"));

  assert.deepEqual(
    custom.map((m) => m.id),
    [
      "custom:openrouter:claude-sonnet-4-6",
      "custom:local-proxy:claude-sonnet-4-6",
    ],
  );
  assert.equal(new Set(custom.map((m) => m.id)).size, custom.length);
});

test("findCustomModelGroup：scoped id 精确命中对应分组，旧 id 保持首个匹配兼容", () => {
  const groups = [
    {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.example/v1",
      apiKey: "sk-a",
      models: [{ id: "vendor/model:alpha", label: "Alpha" }],
    },
    {
      id: "local-proxy",
      name: "Local Proxy",
      baseUrl: "https://proxy.example/v1",
      apiKey: "sk-b",
      models: [{ id: "vendor/model:alpha", label: "Alpha" }],
    },
  ];

  const scoped = buildCustomModelRegistryId("local-proxy", "vendor/model:alpha");
  assert.equal(scoped, "custom:local-proxy:vendor%2Fmodel%3Aalpha");
  assert.equal(findCustomModelGroup(groups, scoped)?.group.id, "local-proxy");
  assert.equal(findCustomModelGroup(groups, "custom:vendor/model:alpha")?.group.id, "openrouter");
});

test("getAllModelsFlat：旧版扁平自定义模型接口保持 custom:modelId 格式", () => {
  const custom = getAllModelsFlat([{ id: "legacy-model", label: "Legacy Model" }]).find(
    (m) => m.label === "Legacy Model",
  );

  assert.equal(custom?.id, "custom:legacy-model");
});

test("normalizeCustomModelRegistryId：旧 custom id 仅在唯一匹配时自动升级为 scoped id", () => {
  assert.equal(
    normalizeCustomModelRegistryId("custom:solo-model", [
      {
        id: "solo",
        name: "Solo",
        baseUrl: "https://solo.example/v1",
        apiKey: "sk-solo",
        models: [{ id: "solo-model" }],
      },
    ]),
    "custom:solo:solo-model",
  );

  const duplicateGroups = [
    {
      id: "a",
      name: "A",
      baseUrl: "https://a.example/v1",
      apiKey: "sk-a",
      models: [{ id: "same-model" }],
    },
    {
      id: "b",
      name: "B",
      baseUrl: "https://b.example/v1",
      apiKey: "sk-b",
      models: [{ id: "same-model" }],
    },
  ];
  assert.equal(normalizeCustomModelRegistryId("custom:same-model", duplicateGroups), "custom:same-model");
  assert.equal(normalizeCustomModelRegistryId("mimo-v2.5", duplicateGroups), "mimo-v2.5");
});

test("MODELS：对话走 relay/mimo，硅基流动仅保留生图", () => {
  const glm = getModelInfo("z-ai/glm-5.3-flash");
  assert.ok(glm);
  assert.equal(glm!.group, "多模态");
  assert.equal(primaryProvider(glm!), "qiniu");
  assert.equal(glm!.thinkingRequired, true);
  assert.deepEqual(glm!.thinkingLevels, ["low", "high", "max"]);
  // 默认降到低档：它现在是 Auto 的主力候选之一，低档延迟明显更低。
  assert.equal(glm!.defaultThinkingEffort, "low");
  assert.equal(glm!.endpoints[0].apiModelId, "z-ai/glm-5.3-flash");
  assert.equal(glm!.endpoints[0].provider, "qiniu");
  assert.equal(glm!.endpoints[1]?.provider, "relay");
  assert.equal(glm!.endpoints[2]?.apiModelId, "mimo-v2.6-flash", "最后一跳换模型兜底");
  assert.equal(glm!.timeoutMs, 120_000);

  const qwen = getModelInfo("Qwen/Qwen3.8-Flash");
  assert.ok(qwen);
  assert.equal(qwen?.icon, "qwen");
  // 上游真实 id 是 Omni 版，registry id 与前端展示保持 3.8 Flash。
  assert.equal(qwen?.endpoints[0]?.apiModelId, "Qwen/Qwen3.8-Omni-Flash");
  assert.equal(qwen?.timeoutMs, 120_000);
  assert.equal(qwen?.vision, true);
  assert.equal(qwen?.thinkingRequestStyle, "openai-reasoning-effort");

  const gemini = getModelInfo("google/gemini-3.8-flash");
  assert.ok(gemini);
  assert.equal(gemini?.icon, "gemini");
  assert.equal(gemini?.thinkingRequired, true);
  assert.equal(gemini?.thinkingRequestStyle, "openai-reasoning-effort");
  assert.deepEqual(gemini!.thinkingLevels, ["low", "medium", "high"]);
  assert.equal(gemini?.timeoutMs, 120_000);

  const ds = getModelInfo("deepseek/deepseek-v4.1-flash");
  assert.ok(ds);
  assert.equal(primaryProvider(ds!), "qiniu");
  // 七牛云方言：thinking 可真正关闭（实测 disabled 后不再产出 reasoning_content）。
  assert.equal(ds!.thinkingRequestStyle, "qiniu-toggle");
  assert.equal(ds!.thinkingRequired, false);
  assert.equal(ds!.vision, true);
  assert.deepEqual(ds!.endpoints.map((e) => e.provider), ["qiniu", "relay"]);

  const qwen37 = getModelInfo("Qwen/Qwen3.7-Flash");
  assert.ok(qwen37);
  assert.equal(qwen37!.thinkingRequestStyle, "qiniu-toggle");
  assert.equal(qwen37!.thinkingRequired, false);
  assert.equal(modelAllowsDisableThinking(qwen37), true);
  assert.equal(modelAllowsDisableThinking(ds), true);
  // GLM 在七牛云「始终思考、不可关闭」，必须保持锁死，否则会发 disabled 拿到 400。
  assert.equal(modelAllowsDisableThinking(glm), false);

  const image = getModelInfo("Tongyi-MAI/Z-Image-Turbo");
  assert.ok(image);
  assert.equal(image?.type, "image");
  assert.equal(image?.group, "生图模型");
  assert.equal(primaryProvider(image!), "siliconflow");

  assert.equal(MODELS.filter((m) => m.type !== "image" && primaryProvider(m) === "siliconflow").length, 0);
  assert.equal(MODELS.filter((m) => primaryProvider(m) === "zhipu").length, 0);
});

test("LEGACY_REGISTRY_ALIASES：每个 value 都能 getModelInfo", () => {
  for (const [legacy, current] of Object.entries(LEGACY_REGISTRY_ALIASES)) {
    const info = getModelInfo(current);
    assert.ok(info, `alias ${legacy} → ${current} 应能 getModelInfo`);
    assert.equal(getModelInfo(legacy)?.id, info!.id);
  }
});

test("getLandedModelInfo：apiModelId 能对上注册表时用落地模型，否则退回 registryId", () => {
  assert.equal(getLandedModelInfo("mimo-v2.6-flash", "z-ai/glm-5.3-flash")?.id, "mimo-v2.6-flash");
  assert.equal(getLandedModelInfo("z-ai/glm-5.3-flash", "z-ai/glm-5.3-flash")?.id, "z-ai/glm-5.3-flash");
  assert.equal(getLandedModelInfo("unknown-upstream", "mimo-v2.6-pro")?.id, "mimo-v2.6-pro");
});

test("getModelInfo：旧 id 映射到当前注册表", () => {
  assert.equal(getModelInfo("deepseek-ai/DeepSeek-V4-Flash")?.id, "deepseek/deepseek-v4.1-flash");
  assert.equal(getModelInfo("deepseek/deepseek-v4-flash")?.id, "deepseek/deepseek-v4.1-flash");
  assert.equal(getModelInfo("Qwen/Qwen3.6-27B")?.id, "Qwen/Qwen3.8-Flash");
  assert.equal(getModelInfo("Qwen/Qwen3.8-27B")?.id, "Qwen/Qwen3.8-Flash");
  assert.equal(getModelInfo("zai-org/GLM-5.2")?.id, "z-ai/glm-5.3-flash");
  assert.equal(getModelInfo("MiniMaxAI/MiniMax-M3")?.id, "Qwen/Qwen3.8-Flash");
  assert.equal(getModelInfo("mimo-v2-flash")?.id, "mimo-v2.6-flash");
  assert.equal(getModelInfo("mimo-v2.5")?.id, "mimo-v2.6-pro");
  assert.equal(getModelInfo("mimo-v2.5-pro")?.id, "mimo-v2.6-pro");
  assert.equal(getModelInfo("google/gemini-3.7-flash")?.id, "google/gemini-3.8-flash");
  assert.equal(getModelInfo("Pro/moonshotai/Kimi-K2.6")?.id, "kimi-k3");
});

test("MODELS：MiMo 2.6 走统一中转，Flash 只列快速，Gemini 快速+多模态双归属", () => {
  const pro = getModelInfo("mimo-v2.6-pro");
  assert.ok(pro);
  assert.equal(primaryProvider(pro!), "relay");
  assert.equal(pro!.group, "多模态");
  assert.equal(pro!.thinkingRequestStyle, "openai-reasoning-effort");
  assert.deepEqual(pro!.thinkingLevels, ['low', 'medium', 'high']);
  assert.equal(modelSupportsThinkingEffort(pro), true);

  const flash = getModelInfo("mimo-v2.6-flash");
  assert.ok(flash);
  assert.equal(flash!.group, "快速模型");
  // 全模态能力（vision → ▦ 圆点）但不在多模态列重复出现。
  assert.equal(flash!.extraGroups, undefined);
  assert.deepEqual(modelMenuCategories(flash!), ["快速模型"]);
  assert.equal(flash!.vision, true);
  assert.equal(primaryProvider(flash!), "relay");

  const ultra = getModelInfo("xiaomi/mimo-v2.6-pro-ultraspeed");
  assert.ok(ultra);
  assert.equal(ultra!.group, "快速模型");
  assert.deepEqual(modelMenuCategories(ultra!), ["快速模型"]);
  assert.equal(ultra!.vision, true);
  assert.equal(ultra!.icon, "mimo");
  assert.equal(primaryProvider(ultra!), "relay");
  assert.equal(ultra!.endpoints[0].apiModelId, "xiaomi/mimo-v2.6-pro-ultraspeed");

  const gemini = getModelInfo("google/gemini-3.8-flash");
  assert.ok(gemini);
  assert.equal(gemini!.group, "多模态");
  assert.deepEqual(gemini!.extraGroups, ["快速模型"]);
  assert.deepEqual(modelMenuCategories(gemini!), ["多模态模型", "快速模型"]);
});

test("思考强度：生图模型不支持档位，GLM 把 medium 钳到 high 并原样下发 max", () => {
  const image = getModelInfo("Tongyi-MAI/Z-Image-Turbo");
  assert.equal(modelSupportsThinkingEffort(image), false);

  const glm = getModelInfo("z-ai/glm-5.3-flash");
  assert.equal(modelSupportsThinkingEffort(glm), true);
  assert.equal(clampThinkingEffort(glm, "medium"), "high");
  assert.equal(wireThinkingEffort(glm, "max"), "max");
  // medium 映射到 low：七牛云只认 low/high/max，且我们在意延迟。
  assert.equal(wireThinkingEffort(glm, "medium"), "low");

  const muse = getModelInfo("meta/muse-spark-1.3-contributor");
  assert.equal(wireThinkingEffort(muse, "high"), "xhigh");
  assert.equal(wireThinkingEffort(muse, "max"), "max");
  assert.equal(clampThinkingEffort(muse, "medium"), "high");
  assert.equal(muse?.vendorTrainingNotice, "对话可能用于厂商训练");
});

test("getAllModels / 菜单：不含桌面自由中转，自定义思考档位进入 ModelInfo", () => {
  assert.ok(getModelInfo(CUSTOM_OPENAI_MODEL_ID));
  assert.equal(
    getAllModels([]).some((m) => m.id === CUSTOM_OPENAI_MODEL_ID),
    false,
  );
  assert.deepEqual(normalizeThinkingLevels(["high", "nope", "low", "high"]), ["low", "high"]);

  const groups = [
    {
      id: "or",
      name: "OpenRouter",
      baseUrl: "https://openrouter.example/v1",
      apiKey: "sk",
      models: [
        {
          id: "think-max",
          label: "Think Max",
          thinking: true,
          thinkingLevels: ["low", "max"] as ThinkingEffort[],
          thinkingRequired: true,
        },
        { id: "think-legacy", label: "Think Legacy", thinking: true },
        { id: "plain", label: "Plain" },
      ],
    },
  ];

  const max = getModelInfoWithCustom(buildCustomModelRegistryId("or", "think-max"), groups);
  assert.equal(max?.thinking, true);
  assert.equal(max?.thinkingRequired, true);
  assert.deepEqual(max?.thinkingLevels, ["low", "max"]);
  assert.equal(modelSupportsThinkingEffort(max), true);
  assert.equal(clampThinkingEffort(max, "medium"), "low");
  assert.equal(wireThinkingEffort(max, "max"), "max");

  const legacy = getModelInfoWithCustom(buildCustomModelRegistryId("or", "think-legacy"), groups);
  assert.deepEqual(legacy?.thinkingLevels, [...THINKING_EFFORT_VALUES]);
  assert.equal(modelSupportsThinkingEffort(legacy), true);

  const plain = getModelInfoWithCustom(buildCustomModelRegistryId("or", "plain"), groups);
  assert.equal(plain?.thinking, false);
  assert.equal(modelSupportsThinkingEffort(plain), false);

  const menu = getModelGroupsWithCustom(groups);
  assert.equal(menu.some((g) => g.group === "自由中转"), false);
  assert.ok(menu.some((g) => g.group === "OpenRouter"));

  assert.deepEqual(max?.endpoints, []);
});

test("hasNextEndpoint：自定义分组恒 false，内置 GLM 有第二跳", () => {
  assert.equal(hasNextEndpoint("custom:g:m", 0), false);
  assert.equal(hasNextEndpoint("custom", 0), false);
  assert.equal(isCustomRegistryId("custom-openai"), false);
  assert.equal(hasNextEndpoint("z-ai/glm-5.3-flash", 0), true);
  assert.equal(hasNextEndpoint("z-ai/glm-5.3-flash", 1), true, "第二跳是 Protocom 同模型");
  assert.equal(hasNextEndpoint("z-ai/glm-5.3-flash", 2), false, "第三跳 MiMo 是最后一跳");
  assert.equal(hasNextEndpoint("mimo-v2.6-pro", 0), false);
});

test("selectCustomApiGroupsForRequest：只返回本次用到的分组", () => {
  const groups = [
    { id: "a", name: "A", baseUrl: "https://a.example/v1", apiKey: "ka", models: [{ id: "m1" }] },
    { id: "b", name: "B", baseUrl: "https://b.example/v1", apiKey: "kb", models: [{ id: "m2" }] },
  ];
  assert.deepEqual(selectCustomApiGroupsForRequest(groups, "z-ai/glm-5.3-flash"), []);
  assert.deepEqual(selectCustomApiGroupsForRequest(groups, "custom-openai"), []);
  const used = selectCustomApiGroupsForRequest(groups, buildCustomModelRegistryId("b", "m2"));
  assert.equal(used.length, 1);
  assert.equal(used[0]?.id, "b");
  assert.equal(used[0]?.apiKey, "kb");
});

test("modelAcceptsImageInput：自定义 vision 声明生效", () => {
  const groups = [{
    id: "g",
    name: "G",
    baseUrl: "https://x.example/v1",
    apiKey: "k",
    models: [
      { id: "see", vision: true },
      { id: "text" },
    ],
  }];
  assert.equal(modelAcceptsImageInput(buildCustomModelRegistryId("g", "see"), groups), true);
  assert.equal(modelAcceptsImageInput(buildCustomModelRegistryId("g", "text"), groups), false);
  assert.equal(modelAcceptsImageInput("mimo-v2.6-pro", []), true);
  assert.equal(modelAcceptsImageInput("meituan/LongCat-2.0:free", []), false);
});

test("MODELS：每个文本模型都声明单次最大输出，未声明时按兜底值", () => {
  for (const m of MODELS.filter((x) => x.type !== "image")) {
    assert.ok((m.maxOutputK ?? 0) > 0, `${m.id} 缺 maxOutputK`);
    assert.ok((m.maxOutputK ?? 0) <= (m.contextK ?? Infinity), `${m.id} 最大输出不能超过上下文`);
  }
  assert.equal(declaredMaxOutputTokens(getModelInfo("gpt-5.6-sol")), 128_000);
  assert.equal(declaredMaxOutputTokens(undefined), FALLBACK_MAX_OUTPUT_TOKENS);
});
