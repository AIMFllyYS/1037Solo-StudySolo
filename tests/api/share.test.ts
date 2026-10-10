import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { NextRequest } from "next/server";
import { GET, PATCH, POST } from "@/app/api/share/route";
import { setQuotaGateTestDeps } from "@/lib/billing/quota/quotaGate";
import { setShareApiTestDeps, type SharedConversationInsert } from "@/lib/share/server";
import { SHARE_ID_LENGTH, isShareId } from "@/lib/share/slug";
import { MAX_SHARE_PAYLOAD_BYTES, buildSharedSnapshot } from "@/lib/share/snapshot";
import type { SharedConversationSnapshot } from "@/lib/share/types";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SITE_ORIGIN = "https://share.example.com";
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  setQuotaGateTestDeps(null);
  setShareApiTestDeps(null);
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

function signIn(userId: string | null = USER): void {
  setQuotaGateTestDeps({ resolveUserId: async () => userId });
}

function snapshot(): SharedConversationSnapshot {
  return buildSharedSnapshot({
    meta: {
      id: "session-1",
      title: "光合作用",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      messageCount: 1,
      artifactIds: [],
    },
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "这是什么？" }], timestamp: 1 }],
    artifacts: [{ id: "art-1", title: "叶片模型", html: "<h1>叶片</h1>", status: "done" }],
  });
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sourceClientId: "session-1", title: "光合作用", payload: snapshot(), ...overrides };
}

function request(raw: unknown): NextRequest {
  return new Request("https://app.invalid/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(raw),
  }) as NextRequest;
}

/** 内存假库：create/list/setEnabled 都对同一份 rows 操作，GET / PATCH 的用例才有意义。 */
function captureStore(): { rows: SharedConversationInsert[]; revoked: Set<string>; fail: boolean } {
  return { rows: [], revoked: new Set(), fail: false };
}

function useStore(state: ReturnType<typeof captureStore>): void {
  setShareApiTestDeps({
    store: {
      async create(row) {
        if (state.fail) throw new Error("insert failed");
        state.rows.push(row);
      },
      async list(ownerId) {
        return state.rows
          .filter((row) => row.ownerId === ownerId)
          .map((row) => ({
            id: row.id,
            title: row.title,
            createdAt: new Date(0).toISOString(),
            revoked: state.revoked.has(row.id),
          }));
      },
      async setEnabled(ownerId, id, enabled) {
        const row = state.rows.find((item) => item.id === id && item.ownerId === ownerId);
        if (!row) return false;
        if (enabled) state.revoked.delete(id);
        else state.revoked.add(id);
        return true;
      },
    },
  });
}

function jsonRequest(method: "GET" | "PATCH", raw?: unknown): NextRequest {
  return new Request("https://app.invalid/api/share", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(raw === undefined ? {} : { body: JSON.stringify(raw) }),
  }) as NextRequest;
}

test("未登录：401 且不落库（客户端传的 owner 字段不作数）", async () => {
  signIn(null);
  const state = captureStore();
  useStore(state);
  const res = await POST(request({ ...body(), ownerId: USER, owner_id: USER, id: "CLIENTCHOSEN" }));
  assert.equal(res.status, 401);
  const json = (await res.json()) as { error: string };
  assert.equal(typeof json.error, "string");
  assert.equal(state.rows.length, 0);
});

test("形状不对：400，且不落库", async () => {
  signIn();
  const state = captureStore();
  useStore(state);
  const cases: unknown[] = [
    null,
    "share",
    [],
    body({ sourceClientId: "" }),
    body({ sourceClientId: 42 }),
    body({ title: 42 }),
    { sourceClientId: "session-1", title: "光合作用" },
    body({ payload: { v: 1, title: "x" } }),
    body({ payload: { ...snapshot(), messages: "nope" } }),
  ];
  for (const raw of cases) {
    const res = await POST(request(raw));
    assert.equal(res.status, 400, `应当 400: ${JSON.stringify(raw)?.slice(0, 60)}`);
    const json = (await res.json()) as { error: string };
    assert.equal(typeof json.error, "string");
  }
  assert.equal(state.rows.length, 0);
});

test("载荷危险（内嵌 data URL）或超限：400 且不落库", async () => {
  signIn();
  const state = captureStore();
  useStore(state);

  const dirty = { ...snapshot(), artifacts: [{ id: "a", title: "t", html: '<img src="data:image/png;base64,QUJDRA==">', status: "done" }] };
  const dirtyRes = await POST(request(body({ payload: dirty })));
  assert.equal(dirtyRes.status, 400);
  assert.match(((await dirtyRes.json()) as { error: string }).error, /媒体数据/);

  const huge: SharedConversationSnapshot = {
    ...snapshot(),
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "x".repeat(MAX_SHARE_PAYLOAD_BYTES + 1) }], timestamp: 1 }],
  };
  const hugeRes = await POST(request(body({ payload: huge })));
  assert.equal(hugeRes.status, 400);
  assert.match(((await hugeRes.json()) as { error: string }).error, /超过分享上限/);

  assert.equal(state.rows.length, 0);
});

test("成功：201，id 由服务端生成，url 走 NEXT_PUBLIC_SITE_URL", async () => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE_ORIGIN;
  signIn();
  const state = captureStore();
  useStore(state);

  const res = await POST(request({ ...body(), id: "CLIENTCHOSEN", owner_id: "someone-else" }));
  assert.equal(res.status, 201);
  const json = (await res.json()) as { id: string; url: string };
  assert.equal(isShareId(json.id), true);
  assert.equal(json.id.length, SHARE_ID_LENGTH);
  assert.notEqual(json.id, "CLIENTCHOSEN");
  assert.equal(json.url, `${SITE_ORIGIN}/s/${json.id}`);
  assert.match(res.headers.get("cache-control") ?? "", /private, no-store/);

  assert.equal(state.rows.length, 1);
  const row = state.rows[0];
  assert.ok(row);
  assert.equal(row.id, json.id);
  // owner 只能来自已鉴权用户，请求体里的 owner_id 被忽略。
  assert.equal(row.ownerId, USER);
  assert.equal(row.sourceClientId, "session-1");
  assert.equal(row.title, "光合作用");
  assert.equal(row.payload.v, 1);
  assert.equal(row.payload.artifacts.length, 1);
  assert.equal(JSON.stringify(row.payload).includes("data:image"), false);
});

test("标题为空时回落到快照标题，落库成功", async () => {
  signIn();
  const state = captureStore();
  useStore(state);
  const res = await POST(request(body({ title: "   " })));
  assert.equal(res.status, 201);
  assert.equal(state.rows[0]?.title, "光合作用");
});

test("落库失败：503 而不是 400（请求本身没错，重试可能就好）", async () => {
  signIn();
  const state = captureStore();
  state.fail = true;
  useStore(state);
  const res = await POST(request(body()));
  assert.equal(res.status, 503);
  const json = (await res.json()) as { error: string; id?: string };
  assert.equal(typeof json.error, "string");
  assert.equal(json.id, undefined);
});

test("GET：未登录 401；登录后只列自己的分享", async () => {
  signIn(null);
  useStore(captureStore());
  assert.equal((await GET(jsonRequest("GET"))).status, 401);

  signIn();
  const state = captureStore();
  useStore(state);
  assert.equal((await POST(request(body()))).status, 201);
  // 另一个人也发了一条：列表不许串号。
  state.rows.push({ ...state.rows[0]!, id: "someoneelses1", ownerId: "ffffffff-0000-0000-0000-000000000000" });

  const res = await GET(jsonRequest("GET"));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { shares: { id: string; title: string; revoked: boolean }[] };
  assert.equal(json.shares.length, 1);
  assert.equal(json.shares[0]?.title, "光合作用");
  assert.equal(json.shares[0]?.revoked, false);
});

test("PATCH：关掉一条后列表里就是已关闭；别人的 / 不存在的返回 404", async () => {
  signIn();
  const state = captureStore();
  useStore(state);
  await POST(request(body()));
  const id = state.rows[0]!.id;

  const off = await PATCH(jsonRequest("PATCH", { id, enabled: false }));
  assert.equal(off.status, 200);
  const listed = (await (await GET(jsonRequest("GET"))).json()) as { shares: { revoked: boolean }[] };
  assert.equal(listed.shares[0]?.revoked, true);

  const back = await PATCH(jsonRequest("PATCH", { id, enabled: true }));
  assert.equal(back.status, 200);
  const relisted = (await (await GET(jsonRequest("GET"))).json()) as { shares: { revoked: boolean }[] };
  assert.equal(relisted.shares[0]?.revoked, false);

  assert.equal((await PATCH(jsonRequest("PATCH", { id: "nope-nope-nope", enabled: false }))).status, 404);
  assert.equal((await PATCH(jsonRequest("PATCH", { id, enabled: "yes" }))).status, 400);
});

test("PATCH：未登录 401", async () => {
  signIn(null);
  useStore(captureStore());
  assert.equal((await PATCH(jsonRequest("PATCH", { id: "abcabcabcabc", enabled: false }))).status, 401);
});
