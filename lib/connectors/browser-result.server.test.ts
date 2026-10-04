import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { connectorBrowserFailure } from "./browser-result.server";

test("OAuth browser recovery uses the configured market path and safe metadata; APIs keep their error", async () => {
  const before = process.env.CONNECTOR_DEV_CALLBACK_ORIGIN;
  process.env.CONNECTOR_DEV_CALLBACK_ORIGIN = "http://localhost:35349";
  try {
    const request = (browser: boolean, host = "localhost:35349") => new NextRequest("http://localhost:35349/api/connectors/google/callback?state=private-fixture&code=private-fixture", { headers: { host, ...(browser ? { accept: "text/html", "sec-fetch-mode": "navigate" } : { accept: "application/json" }) } });
    const cause = Response.json({ code: "ACCOUNT_DISABLED", detail: "private-fixture-provider-body" }, { status: 403 });
    const api = await connectorBrowserFailure(request(false), "google", cause, "OAUTH_NOT_COMPLETED_RETRY_REQUIRED");
    assert.equal(api.status, 403); assert.equal((await api.clone().json()).code, "ACCOUNT_DISABLED");
    const browser = await connectorBrowserFailure(request(true), "google", cause, "OAUTH_NOT_COMPLETED_RETRY_REQUIRED");
    assert.equal(browser.status, 303);
    assert.equal(browser.headers.get("location"), "http://localhost:35349/agent/plugins?connection=google&connection_error=ACCOUNT_DISABLED");
    const unknown = await connectorBrowserFailure(request(true), "google", Response.json({ code: "PRIVATE_PROVIDER_BODY_secret", location: "https://attacker.example" }, { status: 500 }), "OAUTH_NOT_COMPLETED_RETRY_REQUIRED");
    assert.equal(new URL(unknown.headers.get("location")!).searchParams.get("connection_error"), "OAUTH_NOT_COMPLETED_RETRY_REQUIRED");
    assert.ok(!unknown.headers.get("location")!.includes("private-fixture"));
    const wrongHost = await connectorBrowserFailure(request(true, "attacker.example"), "google", cause, "OAUTH_NOT_COMPLETED_RETRY_REQUIRED");
    assert.equal(wrongHost.status, 403); assert.equal(wrongHost.headers.get("location"), null);
  } finally { if (before === undefined) delete process.env.CONNECTOR_DEV_CALLBACK_ORIGIN; else process.env.CONNECTOR_DEV_CALLBACK_ORIGIN = before; }
});
