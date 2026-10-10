import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { kickoffSessionTitle } from "./kickoffSessionTitle.ts";

afterEach(() => {
  if ("fetch" in globalThis) {
    // tests restore via stub replacement
  }
});

test('automatic sessions use a local title without invoking an unrestricted default model', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not request'); });
  const title = kickoffSessionTitle('auto', '解释条件概率', { subjectId: 'a', categoryId: 'b', itemId: 'c' }, () => {}, true);
  assert.ok(title.length > 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("kickoffSessionTitle：立即返回本地兜底标题，成功后再回调远端标题", async () => {
  const calls: { url: unknown; body: Record<string, unknown> }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json({ title: "贝叶斯定理" });
  }) as typeof fetch;

  const applied: string[] = [];
  const fallback = kickoffSessionTitle(
    "s1",
    "针对当前页面这段原文：\n\n> 引用\n\n什么是贝叶斯？",
    { subjectId: "prob", categoryId: "detail", itemId: "1.4" },
    (sessionId, title) => {
      applied.push(`${sessionId}:${title}`);
    },
  );
  assert.ok(fallback.length > 0);
  assert.notEqual(fallback, "贝叶斯定理");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(applied, ["s1:贝叶斯定理"]);
  assert.equal(calls[0]?.url, "/api/chat-title");
  assert.equal(calls[0]?.body.itemId, "1.4");
  globalThis.fetch = originalFetch;
});

test("kickoffSessionTitle：非 ok 或非字符串 title 不回调", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
  let called = false;
  kickoffSessionTitle("s1", "你好", { subjectId: "a", categoryId: "b", itemId: "c" }, () => {
    called = true;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(called, false);
  globalThis.fetch = originalFetch;
});
