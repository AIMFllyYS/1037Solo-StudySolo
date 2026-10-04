import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { forwardDesktopAgentRequest, validateDesktopAgentRequest } from "./desktop-bridge.server";
import { createRequire } from "node:module";
import { desktopModelRequest } from "./desktop-model.server";

test("desktop main Agent forwards only Account authority to the fixed online service", async t => {
  const env = process.env as Record<string, string | undefined>, before = { NODE_ENV: env.NODE_ENV, STUDYSOLO_DESKTOP_RUNTIME: env.STUDYSOLO_DESKTOP_RUNTIME };
  env.NODE_ENV = "production"; env.STUDYSOLO_DESKTOP_RUNTIME = "true";
  try {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (target: string | URL | Request, init?: RequestInit) => {
      requests++; assert.equal(String(target), "https://studysolo.1037solo.com/api/agent/chat/");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer fixture-account-access");
      assert.equal(headers.get("origin"), "https://studysolo.1037solo.com");
      assert.equal(headers.get("cookie"), null); assert.equal(headers.get("x-api-key"), null);
      assert.equal(init?.redirect, "error");
      return new Response("fixture stream", { headers: { "Content-Type": "text/event-stream", "X-Vercel-AI-UI-Message-Stream": "v1", "Set-Cookie": "must-not-forward=fixture" } });
    });
    const make = (path = "/api/agent/chat/", ref = "/agent") => new NextRequest(`http://127.0.0.1:35349${path}`, { method: "POST", headers: { "Content-Type": "application/json", Host: "127.0.0.1:35349", Origin: "http://127.0.0.1:35349", Referer: `http://127.0.0.1:35349${ref}`, Cookie: "ss_access_token=fixture-account-access; operator-secret=fixture" }, body: JSON.stringify({ agentMain: true }) });
    const response = await forwardDesktopAgentRequest(make());
    assert.equal(await response.text(), "fixture stream"); assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
    await assert.rejects(() => forwardDesktopAgentRequest(make("/api/chat/")), /DESKTOP_AGENT_BRIDGE_REJECTED/);
    await assert.rejects(() => forwardDesktopAgentRequest(make("/api/agent/chat/", "/review")), /AGENT_SURFACE_REQUIRED/);
    assert.equal(requests, 1);
    assert.throws(() => validateDesktopAgentRequest(new NextRequest("https://evil.example/api/agent/chat/")), /DESKTOP_AGENT_BRIDGE_REJECTED/);
  } finally { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; }
});

test("Electron environment never inherits operator cloud or connector secrets", () => {
  const require = createRequire(import.meta.url);
  const { withoutOperatorCredentials } = require("../../electron/serverEnvironment.js") as { withoutOperatorCredentials: (env: Record<string, string>) => Record<string, string> };
  const stripped = withoutOperatorCredentials({ PATH: "fixture-path", AI_API_KEY: "inherited-operator-key", QINIU_API_KEY: "inherited-operator-key", AWS_ACCESS_KEY_ID: "inherited-operator-key", GITHUB_TOKEN: "inherited-token", CLOUD_SANDBOX_API_KEY: "private-operator-key", E2B_API_KEY: "private-operator-key", GOOGLE_CONNECTOR_CLIENT_SECRET: "private-operator-secret", SUPABASE_SERVICE_ROLE_KEY: "test", CONNECTOR_TOKEN_ENCRYPTION_KEY: "private-encryption-key" });
  assert.deepEqual(stripped, { PATH: "fixture-path" });
});

test("desktop feedback forwards from other modes without granting them command access", async t => {
  const env = process.env as Record<string, string | undefined>, before = { NODE_ENV: env.NODE_ENV, STUDYSOLO_DESKTOP_RUNTIME: env.STUDYSOLO_DESKTOP_RUNTIME };
  env.NODE_ENV = "production"; env.STUDYSOLO_DESKTOP_RUNTIME = "true";
  try {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (target: string | URL | Request, init?: RequestInit) => {
      requests++; assert.equal(String(target), "https://studysolo.1037solo.com/api/feedback/chat/");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer fixture-account-access");
      assert.equal(headers.get("cookie"), null);
      assert.equal(headers.get("referer"), "https://studysolo.1037solo.com/review");
      return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "30" } });
    });
    const make = (path = "/api/feedback/chat/", origin = "http://127.0.0.1:35349") => new NextRequest(`http://127.0.0.1:35349${path}`, { method: "POST", headers: { "Content-Type": "application/json", Host: "127.0.0.1:35349", Origin: origin, Referer: "http://127.0.0.1:35349/review", Cookie: "ss_access_token=fixture-account-access" }, body: JSON.stringify({ action: "vote", vote: "like", sessionId: "s", messageId: "m" }) });
    const response = await forwardDesktopAgentRequest(make());
    assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "30");
    await assert.rejects(() => forwardDesktopAgentRequest(make("/api/agent/sandbox/")), /AGENT_SURFACE_REQUIRED/);
    await assert.rejects(() => forwardDesktopAgentRequest(make("/api/feedback/chat/", "https://evil.example")), /SANDBOX_ORIGIN_REJECTED/);
    assert.equal(requests, 1);
  } finally { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; }
});
test("desktop model forwarding preserves BYOK and excludes infrastructure secrets", () => {
  const body = desktopModelRequest({ modelId: "custom-openai" }, { RELAY_BASE_URL: "https://provider.example/v1", RELAY_API_KEY: "fixture-user-relay", RELAY_MODEL_ID: "fixture-tool-model", CLOUD_SANDBOX_API_KEY: "must-not-leave-desktop", SUPABASE_SERVICE_ROLE_KEY: "test" });
  assert.equal((body.customApiGroups as { apiKey: string }[])[0].apiKey, "fixture-user-relay");
  assert.ok(!JSON.stringify(body).includes("must-not-leave-desktop"));
  assert.throws(() => desktopModelRequest({ modelId: "custom-openai" }, { RELAY_BASE_URL: "http://127.0.0.1/v1", RELAY_API_KEY: "fixture", RELAY_MODEL_ID: "fixture" }), /私网|回环|内网/);
  const supplied = { modelId: "custom:fixture", customApiGroups: [{ apiKey: "already-selected" }] };
  assert.equal(desktopModelRequest(supplied, { RELAY_API_KEY: "other" }), supplied);
});

test("desktop Review progress preserves bounded query selectors without forwarding authority fields", async t => {
  const env = process.env as Record<string, string | undefined>, before = { NODE_ENV: env.NODE_ENV, STUDYSOLO_DESKTOP_RUNTIME: env.STUDYSOLO_DESKTOP_RUNTIME };
  env.NODE_ENV = "production"; env.STUDYSOLO_DESKTOP_RUNTIME = "true";
  try {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (target: string | URL | Request, init?: RequestInit) => {
      requests++;
      assert.equal(String(target), "https://studysolo.1037solo.com/api/review/progress/?view=summary&limit=25");
      assert.equal(new Headers(init?.headers).get("cookie"), null);
      return Response.json({ attempts: [] });
    });
    const make = (query: string) => new NextRequest(`http://127.0.0.1:35349/api/review/progress/?${query}`, { headers: { "Content-Type": "application/json", Host: "127.0.0.1:35349", Referer: "http://127.0.0.1:35349/review", Cookie: "ss_access_token=fixture-account-access" } });
    assert.equal((await forwardDesktopAgentRequest(make("view=summary&limit=25"))).status, 200);
    await assert.rejects(() => forwardDesktopAgentRequest(make("view=summary&user_id=other")), /SANDBOX_REQUEST_INVALID/);
    await assert.rejects(() => forwardDesktopAgentRequest(make("view=summary&view=attempts")), /SANDBOX_REQUEST_INVALID/);
    await assert.rejects(() => forwardDesktopAgentRequest(make("view=summary&sourceKind=unregistered")), /SANDBOX_REQUEST_INVALID/);
    assert.equal(requests, 1);
  } finally { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; }
});

test("desktop Review writes forward only the captured owner consistency binding", async t => {
  const env = process.env as Record<string, string | undefined>, before = { NODE_ENV: env.NODE_ENV, STUDYSOLO_DESKTOP_RUNTIME: env.STUDYSOLO_DESKTOP_RUNTIME };
  env.NODE_ENV = "production"; env.STUDYSOLO_DESKTOP_RUNTIME = "true";
  try {
    const binding = "a".repeat(64);
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (_target: string | URL | Request, init?: RequestInit) => {
      requests++;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-studysolo-owner-binding"), binding);
      assert.equal(headers.get("x-user-id"), null);
      assert.equal(headers.get("cookie"), null);
      return Response.json({ status: "saved" });
    });
    const make = (value?: string) => new NextRequest("http://127.0.0.1:35349/api/review/progress/", { method: "POST", headers: { "Content-Type": "application/json", Host: "127.0.0.1:35349", Origin: "http://127.0.0.1:35349", Referer: "http://127.0.0.1:35349/review", Cookie: "ss_access_token=fixture-account-access", "x-user-id": "must-not-forward", ...(value ? { "x-studysolo-owner-binding": value } : {}) }, body: "{}" });
    assert.equal((await forwardDesktopAgentRequest(make(binding))).status, 200);
    await assert.rejects(() => forwardDesktopAgentRequest(make()), /REVIEW_OWNER_CHANGED/);
    assert.equal(requests, 1);
  } finally { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; }
});

test("desktop bridge cancels oversized chunked input before forwarding", async t => {
  const env = process.env as Record<string, string | undefined>, before = { NODE_ENV: env.NODE_ENV, STUDYSOLO_DESKTOP_RUNTIME: env.STUDYSOLO_DESKTOP_RUNTIME };
  env.NODE_ENV = "production"; env.STUDYSOLO_DESKTOP_RUNTIME = "true";
  let cancelled = false, pulls = 0;
  try {
    t.mock.method(globalThis, "fetch", async () => { assert.fail("oversized input must not leave the local server"); });
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(8193)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const init = { method: "POST", headers: { "Content-Type": "application/json", Host: "127.0.0.1:35349", Origin: "http://127.0.0.1:35349", Referer: "http://127.0.0.1:35349/review", Authorization: "Bearer synthetic-account-token" }, body, duplex: "half" } as RequestInit & { duplex: "half" };
    await assert.rejects(forwardDesktopAgentRequest(new NextRequest("http://127.0.0.1:35349/api/feedback/chat/", init)), /SANDBOX_REQUEST_TOO_LARGE/);
    assert.equal(cancelled, true);
    assert.equal(pulls, 1);
  } finally { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; }
});
