import { test, PaidRequest } from "@/tests/helpers/paidAiFixture";
import assert from "node:assert/strict";
import { after, afterEach, before, } from "node:test";
import type { NextRequest } from "next/server";
import { buildCustomModelRegistryId, type CustomApiGroup } from "@/lib/ai/models";
import {
  PLATFORM_QUOTA_EXHAUSTED_MESSAGE,
  setQuotaGateTestDeps,
  type QuotaStore,
  type QuotaUserRow,
} from "@/lib/billing/quotaGate";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const envNames = ["AI_BASE_URL", "AI_API_KEY", "RELAY_BASE_URL", "RELAY_API_KEY"] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
let POST: typeof import("@/app/api/document/route")["POST"];

before(async () => {
  process.env.AI_BASE_URL = "https://primary.invalid/v1";
  process.env.AI_API_KEY = "test-only";
  process.env.RELAY_BASE_URL = "https://relay.invalid/v1";
  process.env.RELAY_API_KEY = "relay-test";
  ({ POST } = await import("@/app/api/document/route"));
});

after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

afterEach(() => {
  setQuotaGateTestDeps(null);
});

const groups: CustomApiGroup[] = [
  {
    id: "doc",
    name: "Doc",
    baseUrl: "https://custom.invalid/v1",
    apiKey: "user-key",
    models: [
      { id: "study-model", thinking: false, tools: true, apiProtocol: "openai" },
      { id: "image-model", type: "image" },
    ],
  },
];

function request(body: unknown) {
  return new PaidRequest("https://app.invalid/api/document", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

async function events(res: Response): Promise<Array<{ type?: string; status?: string; message?: string; id?: string }>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()) as { type?: string; status?: string; message?: string; id?: string });
}

function exhaustedStore(): QuotaStore {
  const user: QuotaUserRow = {
    id: USER,
    tier: "free",
    period_start: "2026-09-01T00:00:00.000Z",
    period_end: "2026-10-01T00:00:00.000Z",
  };
  return {
    async getUser() {
      return user;
    },
    async savePeriod() {},
    async listGrants() {
      return [
        {
          pool: "platform",
          tier: "free",
          amount_cny: 7,
          period_start: user.period_start,
          period_end: user.period_end,
        },
      ];
    },
    async listLedger() {
      return [{ pool: "platform", kind: "llm", cost_cny: 7, meta: { source: "chat-main" } }];
    },
  };
}

test("document：缺少 id 返回错误事件", async () => {
  const parts = await events(await POST(request({ spec: { title: "t", format: "markdown", genre: "article", brief: "写" } })));
  const err = parts.find((p) => p.status === "error");
  assert.ok(err);
  assert.match(err.message ?? "", /缺少 document id/);
});

test("document：非法 spec 返回校验错误", async () => {
  const parts = await events(await POST(request({ id: "doc-1", spec: { title: "", format: "markdown", genre: "article", brief: "" } })));
  const err = parts.find((p) => p.status === "error");
  assert.ok(err);
  assert.match(err.message ?? "", /title|brief|String/i);
});

test("document：生图模型拒绝长文档", async () => {
  const parts = await events(await POST(request({
    id: "doc-img",
    modelId: buildCustomModelRegistryId("doc", "image-model"),
    customApiGroups: groups,
    spec: { title: "t", format: "markdown", genre: "article", brief: "写一节" },
  })));
  const err = parts.find((p) => p.status === "error");
  assert.ok(err);
  assert.match(err.message ?? "", /生图模型/);
});

test("document：平台额度耗尽时给出可读错误", async () => {
  setQuotaGateTestDeps({
    now: () => new Date("2026-09-10T00:00:00.000Z"),
    resolveUserId: async () => USER,
    store: exhaustedStore(),
  });
  const parts = await events(await POST(request({
    id: "doc-quota",
    modelId: "z-ai/glm-5.3-flash",
    spec: { title: "t", format: "markdown", genre: "article", brief: "写一节" },
  })));
  const err = parts.find((p) => p.status === "error");
  assert.ok(err);
  assert.equal(err.message, PLATFORM_QUOTA_EXHAUSTED_MESSAGE);
});
