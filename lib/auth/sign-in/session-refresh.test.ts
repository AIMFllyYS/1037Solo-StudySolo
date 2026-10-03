import assert from "node:assert/strict";
import test from "node:test";
import { resetRenewals, renewIfNeeded, downstreamHeaders, forwardCookies } from "./session-refresh";
test("connector/chat session renewal coalesces Account calls and forwards only fresh HttpOnly cookies", async () => {
  resetRenewals(); let calls = 0;
  const token = (exp: number) => `fixture.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.fixture`;
  const fresh = token(Date.now() / 1000 + 3600), expired = token(Date.now() / 1000 - 1);
  const fetchImpl: typeof fetch = async (url, init) => {
    calls++; assert.equal(String(url), "http://account.fixture/api/v1/session/refresh");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), "refresh_token=fixture-refresh"); assert.equal(headers.get("origin"), "http://localhost:35349");
    const responseHeaders = new Headers(); responseHeaders.append("set-cookie", `access_token=${fresh}; Path=/; HttpOnly`); responseHeaders.append("set-cookie", "refresh_token=fixture-rotated-refresh; Path=/; HttpOnly");
    await new Promise(resolve => setTimeout(resolve, 10)); return new Response("{}", { headers: responseHeaders });
  };
  const options = { accountBackendUrl: "http://account.fixture", cookieHeader: `access_token=${expired}; refresh_token=fixture-refresh; connector_dev_google=private-binding`, origin: "http://localhost:35349", pathname: "/api/connectors", fetchImpl };
  const results = await Promise.all([renewIfNeeded(options), renewIfNeeded(options)]); assert.equal(calls, 1);
  assert.equal(results[0]?.kind, "renewed");
  const downstream = downstreamHeaders(new Headers({ cookie: options.cookieHeader }), results[0]);
  assert.ok(downstream?.get("cookie")?.includes(fresh)); assert.ok(downstream?.get("cookie")?.includes("connector_dev_google=private-binding"));
  const response = forwardCookies(new Response("ok"), results[0]); assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
  resetRenewals();
});
