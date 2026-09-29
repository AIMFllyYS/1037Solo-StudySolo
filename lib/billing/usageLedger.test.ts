import assert from "node:assert/strict";
import { test } from "node:test";
import { getModelInfo } from "@/lib/ai/models";
import { createBillingRecord } from "@/lib/stores/billing";
import {
  awaitUsage,
  buildUsageLedgerRow,
  calcByokOverheadCny,
  calcUsageCostCny,
  hasBillableUsage,
  mapLanguageModelUsage,
  resolveActualBillingModelId,
  resolveLedgerUserId,
  runWithLedgerContext,
  settleChatUsage,
  settleUsage,
  hasBillableLedger,
  type UsageLedgerRow,
} from "./usageLedger.ts";
import { BYOK_OVERHEAD_CNY_PER_MILLION } from "./usagePool.ts";

const DEEPSEEK = "deepseek/deepseek-v4-flash";
const IMAGE = "Tongyi-MAI/Z-Image-Turbo";
const MIMO = "mimo-v2.5";
const GLM = "z-ai/glm-5.3-flash";
const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const tokenUsage = { inputTokens: 1_000, outputTokens: 500, totalTokens: 1_500 };

const deepseekFlat = {
  inputTokens: 10_000,
  outputTokens: 500,
  totalTokens: 10_500,
  inputTokenDetails: { noCacheTokens: 7_000, cacheReadTokens: 1_000, cacheWriteTokens: 2_000 },
  outputTokenDetails: { textTokens: 300, reasoningTokens: 200 },
};

function expectedDeepseekCost() {
  const pricing = getModelInfo(DEEPSEEK)?.pricing;
  assert.ok(pricing);
  return calcUsageCostCny(mapLanguageModelUsage(deepseekFlat), pricing, deepseekFlat);
}

test("mapUsage：扁平 LanguageModelUsage 保留 reasoning 与 cache-write", () => {
  const usage = mapLanguageModelUsage(deepseekFlat);
  assert.deepEqual(usage, {
    promptTokens: 10_000,
    completionTokens: 500,
    cachedTokens: 1_000,
    cacheWriteTokens: 2_000,
    reasoningTokens: 200,
    totalTokens: 10_500,
  });
  assert.equal(hasBillableUsage(usage), true);
});

test("mapUsage：嵌套 mock 结构同样落 reasoning / cache-write", () => {
  const usage = mapLanguageModelUsage({
    inputTokens: { total: 10, noCache: 5, cacheRead: 3, cacheWrite: 2 },
    outputTokens: { total: 8, text: 5, reasoning: 3 },
  });
  assert.deepEqual(usage, {
    promptTokens: 10,
    completionTokens: 8,
    cachedTokens: 3,
    cacheWriteTokens: 2,
    reasoningTokens: 3,
    totalTokens: 18,
  });
});

test("0/0 与缺字段都不是可记账用量", () => {
  assert.equal(hasBillableUsage(mapLanguageModelUsage({ inputTokens: 0, outputTokens: 0 })), false);
  assert.equal(hasBillableUsage(mapLanguageModelUsage({})), false);
  assert.equal(hasBillableUsage(mapLanguageModelUsage(undefined)), false);
  assert.equal(buildUsageLedgerRow({ usage: mapLanguageModelUsage({ inputTokens: 0, outputTokens: 0 }), userId: USER }), null);
});

test("cacheWrite 单价进入金额，reasoning 不重复加在 output 上", () => {
  const pricing = getModelInfo("gpt-5.6-luna")?.pricing;
  assert.ok(pricing);
  assert.equal(pricing.cacheWrite, 1.75);
  const usage = mapLanguageModelUsage(deepseekFlat);
  const withWrite = calcUsageCostCny(usage, pricing, deepseekFlat);
  const withoutWritePrice = calcUsageCostCny(usage, { ...pricing, cacheWrite: 0 }, deepseekFlat);
  assert.ok(withWrite > withoutWritePrice);
  // completion 已含 reasoning，公式用 500 而不是 500+200
  assert.equal(
    withWrite,
    Number(((7000 * pricing.input + 1000 * pricing.cachedInput + 2000 * pricing.cacheWrite! + 500 * pricing.output) / 1_000_000).toFixed(6)),
  );
});

test("abort 有消耗：立即写 usage_ledger，金额与上游 token × 单价一致", async () => {
  const rows: UsageLedgerRow[] = [];
  const settled = await settleChatUsage({
    rawUsage: deepseekFlat,
    userId: USER,
    selectedModelId: DEEPSEEK,
    actualModelId: DEEPSEEK,
    pool: "platform",
    sessionId: "sess-abort",
    requestId: "req-abort",
    aborted: true,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(settled.recorded, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reasoning_tokens, 200);
  assert.equal(rows[0].cache_write_tokens, 2_000);
  assert.equal(rows[0].prompt_tokens, 10_000);
  assert.equal(rows[0].completion_tokens, 500);
  assert.equal(rows[0].cached_tokens, 1_000);
  assert.equal(rows[0].cost_cny, expectedDeepseekCost());
  assert.equal(rows[0].route, "/api/chat");
  assert.equal(rows[0].kind, "llm");
  assert.equal(rows[0].meta.aborted, true);
  assert.equal(rows[0].session_id, "sess-abort");
});

test("usage 为 0/0 时不产生任何记录", async () => {
  const rows: UsageLedgerRow[] = [];
  const settled = await settleChatUsage({
    rawUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { reasoningTokens: 0 } },
    userId: USER,
    selectedModelId: DEEPSEEK,
    actualModelId: DEEPSEEK,
    aborted: true,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(settled.recorded, false);
  assert.equal(settled.summary, undefined);
  assert.equal(settled.row, null);
  assert.equal(rows.length, 0);
});

test("reasoning / cache-write 落进 ledger 对应列", async () => {
  const rows: UsageLedgerRow[] = [];
  await settleChatUsage({
    rawUsage: {
      inputTokens: { total: 40, noCache: 10, cacheRead: 20, cacheWrite: 10 },
      outputTokens: { total: 15, text: 4, reasoning: 11 },
    },
    userId: USER,
    selectedModelId: DEEPSEEK,
    actualModelId: DEEPSEEK,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reasoning_tokens, 11);
  assert.equal(rows[0].cache_write_tokens, 10);
});

test("缺 userId 或 insert 失败都不抛，且缺 user 不写库", async () => {
  const rows: UsageLedgerRow[] = [];
  const noUser = await settleChatUsage({
    rawUsage: deepseekFlat,
    userId: null,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(noUser.recorded, false);
  assert.equal(rows.length, 0);
  const failed = await settleChatUsage({
    rawUsage: deepseekFlat,
    userId: USER,
    selectedModelId: DEEPSEEK,
    insert: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(failed.recorded, false);
  assert.ok(failed.row);
});

test("resolveLedgerUserId：Bearer / 校验失败", async () => {
  const verify = async (token: string) => (token === "valid-ada" ? { id: "ada" } : null);
  assert.equal(
    await resolveLedgerUserId({ get: (name) => (name.toLowerCase() === "authorization" ? "Bearer valid-ada" : null) }, { verify }),
    "ada",
  );
  assert.equal(
    await resolveLedgerUserId({ get: () => "Bearer nope" }, { verify }),
    null,
  );
  assert.equal(await resolveLedgerUserId({ get: () => null }, { verify }), null);
  assert.equal(
    await resolveLedgerUserId(
      {
        get: (name) => {
          const key = name.toLowerCase();
          if (key === "authorization") return "Bearer valid-ada";
          if (key === "x-studyreview-user-id") return "from-proxy";
          return null;
        },
      },
      { verify, allowTrustedProxyHeader: true },
    ),
    "ada",
  );
  assert.equal(
    await resolveLedgerUserId(
      {
        get: (name) => {
          const key = name.toLowerCase();
          if (key === "authorization") return "Bearer valid-ada";
          if (key === "x-studyreview-user-id") return "spoofed";
          return null;
        },
      },
      { verify },
    ),
    "ada",
  );
});

test("awaitUsage：已决议的 usage 立即返回，超时返回 undefined", async () => {
  assert.deepEqual(await awaitUsage(Promise.resolve(deepseekFlat), 50), deepseekFlat);
  const hung = new Promise(() => {});
  assert.equal(await awaitUsage(hung, 20), undefined);
});

test("resolveActualBillingModelId：注册表能对上 apiModelId 时用落地模型", () => {
  assert.equal(resolveActualBillingModelId({ registryId: GLM, apiModelId: MIMO }), MIMO);
  assert.equal(resolveActualBillingModelId({ registryId: GLM, apiModelId: GLM }), GLM);
  assert.equal(
    resolveActualBillingModelId({ registryId: "custom:g:study", apiModelId: "study", isCustom: true }),
    "custom:g:study",
  );
});

test("生图模式：按实际文本模型计价，selected 与 actual 可区分", async () => {
  const rows: UsageLedgerRow[] = [];
  const settled = await settleChatUsage({
    rawUsage: tokenUsage,
    userId: USER,
    selectedModelId: IMAGE,
    actualModelId: MIMO,
    insert: async (row) => {
      rows.push(row);
    },
  });
  const mimoCost = calcUsageCostCny(mapLanguageModelUsage(tokenUsage), getModelInfo(MIMO)?.pricing, tokenUsage);
  const imageCost = calcUsageCostCny(mapLanguageModelUsage(tokenUsage), getModelInfo(IMAGE)?.pricing, tokenUsage);
  assert.equal(settled.recorded, true);
  assert.equal(settled.summary?.actualModelId, MIMO);
  assert.equal(rows[0].selected_model_id, IMAGE);
  assert.equal(rows[0].actual_model_id, MIMO);
  assert.notEqual(rows[0].selected_model_id, rows[0].actual_model_id);
  assert.equal(rows[0].cost_cny, mimoCost);
  assert.notEqual(rows[0].cost_cny, imageCost);
  assert.equal(rows[0].cost_cny, 0.006);
});

test("failover：按落地模型计价，两列都有值且不同", async () => {
  const rows: UsageLedgerRow[] = [];
  await settleChatUsage({
    rawUsage: tokenUsage,
    userId: USER,
    selectedModelId: GLM,
    actualModelId: MIMO,
    insert: async (row) => {
      rows.push(row);
    },
  });
  const mimoCost = calcUsageCostCny(mapLanguageModelUsage(tokenUsage), getModelInfo(MIMO)?.pricing, tokenUsage);
  const glmCost = calcUsageCostCny(mapLanguageModelUsage(tokenUsage), getModelInfo(GLM)?.pricing, tokenUsage);
  assert.equal(rows[0].selected_model_id, GLM);
  assert.equal(rows[0].actual_model_id, MIMO);
  assert.notEqual(rows[0].selected_model_id, rows[0].actual_model_id);
  assert.equal(rows[0].cost_cny, mimoCost);
  assert.notEqual(rows[0].cost_cny, glmCost);
});

test("settleUsage：卫星 llm 按 route 入账，0/0 不建行", async () => {
  const rows: UsageLedgerRow[] = [];
  const recorded = await settleUsage({
    rawUsage: tokenUsage,
    userId: USER,
    route: "/api/chat-title",
    kind: "llm",
    selectedModelId: MIMO,
    actualModelId: MIMO,
    meta: { source: "chat-title" },
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(recorded.recorded, true);
  assert.equal(rows[0].route, "/api/chat-title");
  assert.equal(rows[0].kind, "llm");
  assert.equal(rows[0].meta.source, "chat-title");
  const empty = await settleUsage({
    rawUsage: { inputTokens: 0, outputTokens: 0 },
    userId: USER,
    route: "/api/chat-title",
    kind: "llm",
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(empty.recorded, false);
  assert.equal(rows.length, 1);
});

test("settleUsage：侧车 kind 按 units 入账，0 units 不建行", async () => {
  const rows: UsageLedgerRow[] = [];
  await settleUsage({
    kind: "web-search",
    units: 3,
    userId: USER,
    route: "/api/chat",
    actualModelId: "search_pro",
    insert: async (row) => {
      rows.push(row);
    },
  });
  await settleUsage({
    kind: "rerank",
    units: 8,
    rawUsage: { inputTokens: 40, outputTokens: 0 },
    userId: USER,
    actualModelId: "BAAI/bge-reranker-v2-m3",
    insert: async (row) => {
      rows.push(row);
    },
  });
  await settleUsage({
    kind: "web-search",
    units: 0,
    userId: USER,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, "web-search");
  assert.equal(rows[0].meta.units, 3);
  assert.equal(rows[1].kind, "rerank");
  assert.equal(rows[1].prompt_tokens, 40);
  assert.equal(hasBillableLedger({ kind: "image-search", usage: mapLanguageModelUsage({}), units: 0 }), false);
});

test("byok 池按 ¥0.5/百万 token 计量，不用落地模型单价", () => {
  const usage = mapLanguageModelUsage({ inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 });
  const row = buildUsageLedgerRow({
    usage,
    userId: USER,
    pool: "byok",
    kind: "embedding",
    actualModelId: MIMO,
    units: 1,
  });
  assert.ok(row);
  assert.equal(row.cost_cny, BYOK_OVERHEAD_CNY_PER_MILLION);
  assert.equal(calcByokOverheadCny(usage, 1), 0.5);
});

test("BYOK 主模型 skipInsert 不落行", async () => {
  const rows: UsageLedgerRow[] = [];
  const settled = await settleChatUsage({
    rawUsage: tokenUsage,
    userId: USER,
    selectedModelId: MIMO,
    actualModelId: MIMO,
    skipInsert: true,
    insert: async (row) => {
      rows.push(row);
    },
  });
  assert.equal(settled.recorded, false);
  assert.equal(rows.length, 0);
  assert.ok(settled.summary);
});

test("settleUsage：ALS 提供 userId 与 insert", async () => {
  const rows: UsageLedgerRow[] = [];
  await runWithLedgerContext({ userId: USER, insert: async (row) => { rows.push(row); }, route: "/api/record" }, async () => {
    const settled = await settleUsage({
      rawUsage: tokenUsage,
      kind: "llm",
      selectedModelId: MIMO,
      actualModelId: MIMO,
      meta: { source: "record" },
    });
    assert.equal(settled.recorded, true);
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].route, "/api/record");
  assert.equal(rows[0].user_id, USER);
});

test("客户端账单：传入实际文本模型而非生图 id", () => {
  const usage = { promptTokens: 1_000, completionTokens: 500, cachedTokens: 0, totalTokens: 1_500 };
  const imagePriced = createBillingRecord({ type: "chat", modelId: IMAGE, sessionId: "s", customGroups: [], usage });
  const textPriced = createBillingRecord({ type: "chat", modelId: MIMO, sessionId: "s", customGroups: [], usage });
  assert.equal(textPriced.cost, 0.006);
  assert.ok(textPriced.cost > imagePriced.cost);
});
