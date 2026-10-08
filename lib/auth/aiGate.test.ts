import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { config } from "../../proxy.ts";
import {
  AI_GATE_RATE_LIMITED,
  AI_GATE_UNAUTHORIZED,
  decideAiGate,
  extractAccessToken,
  isPaidAiApiPath,
  isPaidAiApiUrl,
  PAID_AI_API_PATHS,
  verifySupabaseAccessToken,
} from "./aiGate.ts";
import { installAiAuthFetch } from "./installAiAuthFetch.ts";
import { resetRateLimitStore } from "./rateLimit.ts";
import {
  AUTH_ACCESS_COOKIE,
  readAccessTokenFromCookieHeader,
  serializeAccessTokenCookie,
  serializeClearedAccessTokenCookie,
  sessionAccessToken,
} from "./sessionCookie.ts";

afterEach(() => {
  resetRateLimitStore();
});

function headers(init?: Record<string, string>): { get(name: string): string | null } {
  const bag = new Headers(init);
  return { get: (name) => bag.get(name) };
}

const allowAda = async (token: string) => (token === "valid-ada" ? { id: "ada" } : null);
const allowBob = async (token: string) => (token === "valid-bob" ? { id: "bob" } : null);

test("proxy matcher 覆盖全部 /api（剥掉伪造的可信 header），gate 只拦付费路由", () => {
  // x-studyreview-user-id 是 proxy 验证后注入的内部信号：matcher 必须罩住每一条
  // /api 请求才能先剥掉客户端自报值，而不是只罩 PAID_AI_API_PATHS。
  // /login 也在 matcher 内：历史域名拿不到 Account 共享 cookie，proxy 需要在那里
  // 308 到正式域名，不再提供独立登录入口。
  assert.deepEqual(config.matcher, ["/api/:path*", "/login"]);
  for (const path of PAID_AI_API_PATHS) {
    assert.ok(path.startsWith("/api/"), `${path} 应被 /api/:path* 覆盖`);
    assert.equal(isPaidAiApiPath(path), true);
    assert.equal(isPaidAiApiPath(`${path}/`), true);
    assert.equal(isPaidAiApiUrl(path), true);
    assert.equal(isPaidAiApiUrl(`https://app.invalid${path}`), true);
  }
  for (const path of ["/api/can-embed", "/api/section", "/api/quiz", "/api/examples", "/api/health/search", "/api/usage", "/api/redeem", "/login"]) {
    assert.equal(isPaidAiApiPath(path), false);
    assert.equal(isPaidAiApiUrl(path), false);
  }
});

test("extractAccessToken prefers Authorization over the session cookie", () => {
  assert.equal(extractAccessToken(headers()), null);
  assert.equal(
    extractAccessToken(headers({ authorization: "Bearer header-token" })),
    "header-token",
  );
  assert.equal(
    extractAccessToken(
      headers({
        cookie: serializeAccessTokenCookie("cookie-token"),
        authorization: "Bearer header-token",
      }),
    ),
    "header-token",
  );
  assert.equal(
    extractAccessToken(headers({ cookie: `${AUTH_ACCESS_COOKIE}=cookie-token` })),
    "cookie-token",
  );
  assert.equal(sessionAccessToken({ access_token: "t" }), "t");
  assert.equal(sessionAccessToken({ user: { id: "u" } }), null);
  assert.equal(readAccessTokenFromCookieHeader(serializeClearedAccessTokenCookie()), null);
});

test("unauthenticated paid AI requests are 401, including Electron UA and BYOK-shaped calls", async () => {
  const electron = { ...(await decideAiGate({
    pathname: "/api/chat",
    method: "POST",
    headers: headers({ "user-agent": "Mozilla/5.0 Electron/31.0.0" }),
  })), };
  assert.deepEqual(electron, { action: "reject", status: 401, body: { ...AI_GATE_UNAUTHORIZED } });

  const forged = await decideAiGate(
    {
      pathname: "/api/artifact",
      method: "POST",
      headers: headers({ authorization: "Bearer forged" }),
    },
    { verifyAccessToken: allowAda },
  );
  assert.equal(forged.action, "reject");
  if (forged.action === "reject") assert.equal(forged.status, 401);

  const byok = await decideAiGate({
    pathname: "/api/image-gen",
    method: "POST",
    headers: headers({ "x-custom-api-key": "sk-user-owned" }),
  });
  assert.equal(byok.action, "reject");
  if (byok.action === "reject") assert.equal(byok.status, 401);
});

test("a mocked valid session passes the gate from cookie or Authorization", async () => {
  const viaHeader = await decideAiGate(
    {
      pathname: "/api/chat-title",
      method: "POST",
      headers: headers({ authorization: "Bearer valid-ada" }),
    },
    { verifyAccessToken: allowAda },
  );
  assert.deepEqual(viaHeader, { action: "next", userId: "ada" });

  const viaCookie = await decideAiGate(
    {
      pathname: "/api/document",
      method: "POST",
      headers: headers({ cookie: `${AUTH_ACCESS_COOKIE}=valid-ada` }),
    },
    { verifyAccessToken: allowAda },
  );
  assert.deepEqual(viaCookie, { action: "next", userId: "ada" });

  const electronSignedIn = await decideAiGate(
    {
      pathname: "/api/record",
      method: "POST",
      headers: headers({
        authorization: "Bearer valid-ada",
        "user-agent": "Mozilla/5.0 Electron/31.0.0",
      }),
    },
    { verifyAccessToken: allowAda },
  );
  assert.deepEqual(electronSignedIn, { action: "next", userId: "ada" });
});

test("non-AI routes and CORS preflight are not gated", async () => {
  const free = await decideAiGate({
    pathname: "/api/can-embed",
    method: "GET",
    headers: headers(),
  });
  assert.deepEqual(free, { action: "next" });

  const preflight = await decideAiGate({
    pathname: "/api/chat",
    method: "OPTIONS",
    headers: headers(),
  });
  assert.deepEqual(preflight, { action: "next" });
});

test("signed-in callers are rate-limited per user after the window max", async () => {
  const deps = { verifyAccessToken: allowAda, max: 2, windowMs: 60_000, now: 9_000_000 };
  const first = await decideAiGate(
    { pathname: "/api/follow-ups", method: "POST", headers: headers({ authorization: "Bearer valid-ada" }) },
    deps,
  );
  const second = await decideAiGate(
    { pathname: "/api/canvas-revise", method: "POST", headers: headers({ authorization: "Bearer valid-ada" }) },
    deps,
  );
  const third = await decideAiGate(
    { pathname: "/api/chat", method: "POST", headers: headers({ authorization: "Bearer valid-ada" }) },
    deps,
  );
  assert.deepEqual(first, { action: "next", userId: "ada" });
  assert.deepEqual(second, { action: "next", userId: "ada" });
  assert.equal(third.action, "reject");
  if (third.action === "reject") {
    assert.equal(third.status, 429);
    assert.deepEqual(third.body, { ...AI_GATE_RATE_LIMITED });
    assert.equal(third.headers?.["Retry-After"], "60");
  }

  const otherUser = await decideAiGate(
    { pathname: "/api/chat", method: "POST", headers: headers({ authorization: "Bearer valid-bob" }) },
    { verifyAccessToken: allowBob, max: 2, windowMs: 60_000, now: 9_000_000 },
  );
  assert.deepEqual(otherUser, { action: "next", userId: "bob" });
});

test("installAiAuthFetch adds a Bearer token only on paid AI URLs", async () => {
  const calls: Array<{ url: unknown; auth: string | null }> = [];
  const restore = installAiAuthFetch(async () => "valid-ada", (async (input, init) => {
    calls.push({ url: input, auth: new Headers(init?.headers).get("Authorization") });
    return new Response("ok");
  }) as typeof fetch);

  await fetch("/api/chat", { method: "POST" });
  await fetch("/api/can-embed");
  await fetch("/api/chat-title", { headers: { Authorization: "Bearer already" } });
  restore();

  assert.deepEqual(calls, [
    { url: "/api/chat", auth: "Bearer valid-ada" },
    { url: "/api/can-embed", auth: null },
    { url: "/api/chat-title", auth: "Bearer already" },
  ]);
});

test("verifySupabaseAccessToken fails closed without a user", async (context) => {
  context.mock.method(globalThis,'fetch',async()=>Response.json({code:'SESSION_INVALID'},{status:401}));
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    assert.equal(await verifySupabaseAccessToken("anything"), null);
  } finally {
    if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
