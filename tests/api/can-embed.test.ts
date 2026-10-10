import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { NextRequest } from "next/server";
import { createProbeHandler, guardProbeUrl, judge } from "@/lib/browser/probeEmbed";
import { checkCustomBaseUrl } from "@/lib/ai/endpoints/customBaseUrl";

function probeReq(url: string | null): NextRequest {
  const href =
    url === null
      ? "https://app.invalid/api/can-embed"
      : `https://app.invalid/api/can-embed?url=${encodeURIComponent(url)}`;
  return new Request(href) as NextRequest;
}

async function probeJson(url: string | null) {
  const handler = createProbeHandler(async () => [{ address: "8.8.8.8", family: 4 }]);
  const res = await handler(probeReq(url));
  return res.json() as Promise<{
    embeddable: boolean;
    reason?: string;
    status?: number;
    finalUrl?: string;
    error?: string;
  }>;
}

test("judge：无 X-Frame-Options 和 CSP 时可嵌入", () => {
  const h = new Headers();
  assert.deepEqual(judge(h), { embeddable: true });
});

test("judge：X-Frame-Options DENY 不可嵌入", () => {
  const h = new Headers({ "x-frame-options": "DENY" });
  assert.equal(judge(h).embeddable, false);
  assert.ok(judge(h).reason?.includes("DENY"));
});

test("judge：X-Frame-Options SAMEORIGIN 不可嵌入", () => {
  const h = new Headers({ "x-frame-options": "SAMEORIGIN" });
  assert.equal(judge(h).embeddable, false);
});

test("judge：X-Frame-Options ALLOW-FROM 不可嵌入", () => {
  const h = new Headers({ "x-frame-options": "ALLOW-FROM https://example.com" });
  assert.equal(judge(h).embeddable, false);
});

test("judge：X-Frame-Options 大小写不敏感", () => {
  const h = new Headers({ "x-frame-options": "deny" });
  assert.equal(judge(h).embeddable, false);
});

test("judge：CSP frame-ancestors 'none' 不可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors 'none'",
  });
  assert.equal(judge(h).embeddable, false);
});

test("judge：CSP frame-ancestors * 可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors *",
  });
  assert.equal(judge(h).embeddable, true);
});

test("judge：CSP frame-ancestors 'self' 不可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors 'self'",
  });
  assert.equal(judge(h).embeddable, false);
});

test("judge：CSP 含其他指令但无 frame-ancestors 时可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "default-src 'self'",
  });
  assert.equal(judge(h).embeddable, true);
});

test("judge：X-Frame-Options 优先于 CSP", () => {
  const h = new Headers({
    "x-frame-options": "DENY",
    "content-security-policy": "frame-ancestors *",
  });
  // XFO 先检查，返回不可嵌入
  assert.equal(judge(h).embeddable, false);
});

test("judge：CSP frame-ancestors 带多个域名时不可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors https://a.com https://b.com",
  });
  assert.equal(judge(h).embeddable, false);
});

test("judge：CSP frame-ancestors https: 在 https 源下可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors https:",
  });
  assert.equal(judge(h, "https://app.example").embeddable, true);
  assert.equal(judge(h, "http://app.example").embeddable, false);
});

test("judge：CSP frame-ancestors 列出本源时可嵌入", () => {
  const h = new Headers({
    "content-security-policy": "frame-ancestors https://app.invalid https://other.example",
  });
  assert.equal(judge(h, "https://app.invalid").embeddable, true);
});

test("guardProbeUrl：复用字面主机校验拒绝回环与私网", () => {
  for (const raw of [
    "http://127.0.0.1/",
    "http://localhost/admin",
    "http://[::1]/",
    "http://192.168.1.1/",
    "http://10.0.0.8/",
    "http://172.16.0.1/",
    "http://169.254.169.254/",
  ]) {
    assert.equal(checkCustomBaseUrl(raw).ok, false);
    assert.deepEqual(guardProbeUrl(raw), { ok: false, reason: "blocked-private" });
  }
});

test("guardProbeUrl：公网 http(s) 可通过", () => {
  const result = guardProbeUrl("https://example.com/page");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.url.hostname, "example.com");
});

test("GET：直接私网与回环被拒绝且不发请求", async (t: TestContext) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch private or loopback");
  });
  for (const raw of ["http://127.0.0.1/", "http://localhost/", "http://192.168.0.10/secret"]) {
    const body = await probeJson(raw);
    assert.equal(body.embeddable, false);
    assert.equal(body.reason, "blocked-private");
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("GET：公网 302 到私网被拦截且不跟随", async (t: TestContext) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, "manual");
    const href = String(input);
    if (href.startsWith("https://example.com/")) {
      return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/secret" } });
    }
    throw new Error(`must not follow unsafe redirect: ${href}`);
  });
  const body = await probeJson("https://example.com/page");
  assert.equal(body.embeddable, false);
  assert.equal(body.reason, "blocked-private");
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("GET：公网 302 到另一私网 IP 同样拦截", async (t: TestContext) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const href = String(input);
    if (href.startsWith("https://cdn.example.com/")) {
      return new Response(null, { status: 301, headers: { Location: "http://10.1.2.3/internal" } });
    }
    throw new Error(`must not follow unsafe redirect: ${href}`);
  });
  const body = await probeJson("https://cdn.example.com/doc");
  assert.equal(body.embeddable, false);
  assert.equal(body.reason, "blocked-private");
});

test("GET：公网正常探测仍返回可嵌入", async (t: TestContext) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, "manual");
    assert.equal(String(input), "https://example.com/");
    return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
  });
  const body = await probeJson("https://example.com/");
  assert.equal(body.embeddable, true);
  assert.equal(body.status, 200);
  assert.equal(body.finalUrl, "https://example.com/");
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("GET：公网 302 到另一公网后再判定头", async (t: TestContext) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, "manual");
    const href = String(input);
    if (href === "https://example.com/old") {
      return new Response(null, { status: 302, headers: { Location: "/new" } });
    }
    if (href === "https://example.com/new") {
      return new Response(null, { status: 200, headers: { "x-frame-options": "DENY" } });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  const body = await probeJson("https://example.com/old");
  assert.equal(body.embeddable, false);
  assert.ok(body.reason?.includes("DENY"));
  assert.equal(body.finalUrl, "https://example.com/new");
});

test("GET：403 不武断阻断，允许前端尝试内嵌", async (t: TestContext) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  const body = await probeJson("https://example.com/challenge");
  assert.equal(body.embeddable, true);
  assert.equal(body.status, 403);
});

test("GET: a public hostname resolving to a private IP never reaches fetch", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  const handler = createProbeHandler(async () => [{ address: "127.0.0.1", family: 4 }]);
  const body = await (await handler(probeReq("https://public.example/"))).json();
  assert.equal(body.embeddable, false);
  assert.equal(body.reason, "blocked-probe-network");
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("GET: every redirect independently rejects a private DNS answer", async t => {
  const lookedUp: string[] = [];
  const handler = createProbeHandler(async hostname => {
    lookedUp.push(hostname);
    return [{ address: hostname === "public.example" ? "8.8.8.8" : "10.0.0.1", family: 4 }];
  });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, {
    status: 302, headers: { Location: "https://another.example/" },
  }));
  const body = await (await handler(probeReq("https://public.example/"))).json();
  assert.equal(body.embeddable, false);
  assert.equal(body.reason, "blocked-probe-network");
  assert.deepEqual(lookedUp, ["public.example", "another.example"]);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("GET: upstream exceptions are not reflected with private diagnostic data", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("synthetic-private-diagnostic"); });
  const body = await probeJson("https://public.example/");
  assert.equal(body.error, "network-unavailable");
  assert.equal(JSON.stringify(body).includes("synthetic-private-diagnostic"), false);
});

test("guardProbeUrl rejects embedded credentials", () => {
  assert.deepEqual(guardProbeUrl("https://synthetic:synthetic@example.com/"), { ok: false, reason: "bad-url" });
});
