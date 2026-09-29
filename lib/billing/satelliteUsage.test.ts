import { test, mockPaidFetch, PaidRequest } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { after, before, type TestContext } from "node:test";
import type { NextRequest } from "next/server";
import { buildCustomModelRegistryId, type CustomApiGroup } from "@/lib/ai/models";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { generateFallbackFollowUps } from "@/lib/ai/agent/followUps";
import { streamDocument } from "@/lib/ai/document";
import { runWebSearchDetailed, searchCached } from "@/lib/ai/webSearch";
import { searchImages } from "@/lib/ai/imageSearch";
import { SiliconFlowEmbedding } from "@/lib/ai/embedding";
import { runWithLedgerContext, type UsageLedgerRow } from "./usageLedger.ts";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const groups: CustomApiGroup[] = [{
  id: "sat-bill",
  name: "Satellite billing",
  baseUrl: "https://sat-bill.invalid/v1",
  apiKey: "sat-bill-key",
  models: [{ id: "text-model", apiProtocol: "openai", thinking: false }],
}];
const modelId = buildCustomModelRegistryId("sat-bill", "text-model");
const spec = { title: "测试文档", format: "markdown" as const, genre: "essay" as const, brief: "写一篇短文" };

const envNames = [
  "ZHIPU_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_EMBEDDING_MODEL",
  "RELAY_BASE_URL",
  "RELAY_API_KEY",
  "AI_TITLE_MODEL",
  "AI_TITLE_BASE_URL",
  "AI_TITLE_API_KEY",
] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

before(() => {
  process.env.ZHIPU_API_KEY = "zhipu-test-key";
  process.env.UNSPLASH_ACCESS_KEY = "unsplash-test-key";
  process.env.AI_BASE_URL = "https://embed.invalid/v1";
  process.env.AI_API_KEY = "embed-test-key";
  process.env.AI_EMBEDDING_MODEL = "BAAI/bge-m3";
});
after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

function event(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function openAiJson(content: string): Response {
  return Response.json({
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
  });
}

function openAiStream(content: string, usage = { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }): Response {
  const parts = [
    { choices: [{ delta: { content } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage },
  ];
  return new Response(parts.map(event).join("") + "data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function captureRows<T>(fn: () => Promise<T>): Promise<{ value: T; rows: UsageLedgerRow[] }> {
  const rows: UsageLedgerRow[] = [];
  const value = await runWithLedgerContext(
    { userId: USER, insert: async (row) => { rows.push(row); } },
    fn,
  );
  return { value, rows };
}

/** BYOK 轮：主模型走用户自己的 key，所以主模型不入账（skipInsert 进 ALS）。 */
async function captureRowsInByokRound<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; rows: UsageLedgerRow[] }> {
  const rows: UsageLedgerRow[] = [];
  const value = await runWithLedgerContext(
    {
      userId: USER,
      mainUsedPlatformCredentials: false,
      skipInsert: true,
      insert: async (row) => { rows.push(row); },
    },
    fn,
  );
  return { value, rows };
}

test("FollowUp 兜底：平台模型入账 /api/follow-ups", async (t: TestContext) => {
  mockPaidFetch(t, async () => openAiJson("如何应用|如何验证|能否推广"));
  const { value, rows } = await captureRows(() =>
    generateFallbackFollowUps({
      userText: "什么是线粒体",
      answerText: "细胞器",
      modelId: "z-ai/glm-5.3-flash",
      isCustom: false,
    }),
  );
  assert.deepEqual(value, ["如何应用", "如何验证", "能否推广"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].route, "/api/follow-ups");
  assert.equal(rows[0].pool, "platform");
  assert.equal(rows[0].meta.source, "followup-fallback");
});

test("FollowUp 兜底第二次 generateText 入账 /api/follow-ups", async (t: TestContext) => {
  mockPaidFetch(t, async () => openAiJson("如何应用|如何验证|能否推广"));
  const { value, rows } = await captureRows(() =>
    generateFallbackFollowUps({
      userText: "什么是线粒体",
      answerText: "细胞器",
      modelId,
      isCustom: true,
      custom: groups,
    }),
  );
  assert.deepEqual(value, ["如何应用", "如何验证", "能否推广"]);
  assert.equal(rows.length, 0, "BYOK 主模型追问不进池、不落行");
});

test("文档大纲与每节分别入账", async (t: TestContext) => {
  const model = resolveLanguageModel(modelId, groups).model;
  mockPaidFetch(t, async () =>
    openAiStream('[{"title":"引言","brief":"开篇"}]', { prompt_tokens: 15, completion_tokens: 9, total_tokens: 24 }),
  );
  const outline = await captureRows(() =>
    streamDocument({
      send: () => {},
      id: "doc-bill",
      request: { id: "doc-bill", spec, phase: "outline" },
      model,
    }),
  );
  assert.equal(outline.rows.length, 1);
  assert.equal(outline.rows[0].route, "/api/document");
  assert.equal(outline.rows[0].meta.phase, "outline");
  assert.equal(outline.rows[0].prompt_tokens, 15);

  mockPaidFetch(t, async () =>
    openAiStream("## 引言\n正文", { prompt_tokens: 30, completion_tokens: 11, total_tokens: 41 }),
  );
  const section = await captureRows(() =>
    streamDocument({
      send: () => {},
      id: "doc-bill",
      request: {
        id: "doc-bill",
        spec,
        phase: "section",
        outline: [{ title: "引言", brief: "开篇" }],
        sectionIndex: 0,
        previousMarkdown: "",
      },
      model,
    }),
  );
  assert.equal(section.rows.length, 1);
  assert.equal(section.rows[0].route, "/api/document");
  assert.equal(section.rows[0].meta.phase, "section");
  assert.equal(section.rows[0].meta.sectionIndex, 0);
  assert.equal(section.rows[0].prompt_tokens, 30);
  assert.notEqual(outline.rows[0].meta.phase, section.rows[0].meta.phase);
});

test("卫星路由 /api/chat-title 入账", async (t: TestContext) => {
  process.env.RELAY_BASE_URL = "https://title-bill.invalid/v1";
  process.env.RELAY_API_KEY = "title-bill-key";
  process.env.AI_TITLE_MODEL = "title-bill-model";
  delete process.env.AI_TITLE_BASE_URL;
  delete process.env.AI_TITLE_API_KEY;
  const { POST } = await import("@/app/api/chat-title/route");
  mockPaidFetch(t, async () => openAiJson("线粒体笔记"));
  const req = new PaidRequest("https://local.invalid/api/chat-title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "什么是线粒体" }),
  }) as NextRequest;
  const { value, rows } = await captureRows(() => POST(req));
  const body = await value.json() as { generated: boolean; title: string };
  assert.equal(body.generated, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].route, "/api/chat-title");
  assert.equal(rows[0].kind, "llm");
  assert.equal(rows[0].meta.source, "chat-title");
});

test("工具侧车：联网搜索 / 搜图 / 嵌入入账，缓存命中不建行", async (t: TestContext) => {
  const query = `billing-sidecar-${Date.now()}`;
  mockPaidFetch(t, async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("web_search")) {
      return Response.json({
        search_result: [{ title: "细胞", link: "https://example.test/cell", content: "简介" }],
      });
    }
    if (url.includes("unsplash.com")) {
      return Response.json({
        results: [{
          id: "p1",
          urls: { raw: "r", full: "f", regular: "https://img.test/a.jpg", small: "s", thumb: "t" },
          user: { name: "作者" },
          links: { html: "https://unsplash.com/p1", download_location: "https://api.unsplash.com/dl" },
          alt_description: "细胞图",
          width: 1200,
          height: 800,
        }],
      });
    }
    if (url.includes("/embeddings")) {
      return Response.json({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { prompt_tokens: 9 },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const search = await captureRows(() => runWebSearchDetailed(query, 3));
  assert.equal(search.value.cacheHit, false);
  assert.equal(search.rows.length, 1);
  assert.equal(search.rows[0].kind, "web-search");
  assert.equal(search.rows[0].meta.source, "webSearch");
  assert.equal(search.rows[0].pool, "platform");

  const cached = await captureRows(() => runWebSearchDetailed(query, 3));
  assert.equal(cached.value.cacheHit, true);
  assert.equal(cached.rows.length, 0);

  const images = await captureRows(() => searchImages("线粒体示意图", 2));
  assert.ok(images.value.configured);
  assert.ok(images.value.results.length > 0);
  assert.equal(images.rows.length, 1);
  assert.equal(images.rows[0].kind, "image-search");
  assert.equal(images.rows[0].image_count, images.value.results.length);
  assert.equal(images.rows[0].pool, "platform");

  const embed = await captureRows(() => new SiliconFlowEmbedding().embed("核糖体"));
  assert.deepEqual(embed.value, [0.1, 0.2]);
  assert.equal(embed.rows.length, 1);
  assert.equal(embed.rows[0].kind, "embedding");
  assert.equal(embed.rows[0].prompt_tokens, 9);
  assert.equal(embed.rows[0].actual_model_id, "BAAI/bge-m3");

  // 用户自备侧车 key：这笔钱是用户自己付的，不该进任何池。
  const ownKeySearch = await captureRows(() =>
    searchCached(`billing-sidecar-ownkey-${Date.now()}`, 3, { apiKey: "user-zhipu-key" }),
  );
  assert.equal(ownKeySearch.value.usedPlatformCredentials, false);
  assert.deepEqual(ownKeySearch.rows, []);

  const ownKeyImages = await captureRows(() => searchImages("线粒体示意图", 2, { apiKey: "user-unsplash-key" }));
  assert.equal(ownKeyImages.value.configured, true);
  assert.equal(ownKeyImages.value.usedPlatformCredentials, false);
  assert.deepEqual(ownKeyImages.rows, []);
});

test("BYOK 轮里我们垫付的平台侧车进 byok 池，不进 platform", async (t: TestContext) => {
  mockPaidFetch(t, async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("web_search")) {
      return Response.json({
        search_result: [{ title: "细胞", link: "https://example.test/cell", content: "简介" }],
      });
    }
    if (url.includes("/embeddings")) {
      return Response.json({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { prompt_tokens: 9 },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  // 平台 key 的搜索：主模型是 BYOK，所以这笔平台开销要按 ¥0.5/百万 token 记进 byok。
  const search = await captureRowsInByokRound(() =>
    searchCached(`billing-sidecar-byok-round-${Date.now()}`, 3),
  );
  assert.equal(search.value.usedPlatformCredentials, true);
  assert.equal(search.rows.length, 1);
  assert.equal(search.rows[0].pool, "byok");
  assert.equal(search.rows[0].kind, "web-search");

  // 主模型的 skipInsert 不该把侧车一起吞掉。
  const embed = await captureRowsInByokRound(() => new SiliconFlowEmbedding().embed("核糖体"));
  assert.deepEqual(embed.value, [0.1, 0.2]);
  assert.equal(embed.rows.length, 1);
  assert.equal(embed.rows[0].pool, "byok");
  assert.equal(embed.rows[0].kind, "embedding");
});
