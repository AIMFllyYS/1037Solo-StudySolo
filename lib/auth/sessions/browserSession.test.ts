import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browserSessionPayload,
  currentAccessToken,
  freshAccessToken,
  onBrowserSessionChange,
  parseBrowserSession,
  setAccessTokenRenewer,
  setBrowserSession,
} from "./browserSession.ts";
import { browserSessionBody } from "../server/browserSessionBody.ts";

const jwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const now = () => Math.floor(Date.now() / 1000);

test("the session body for the browser carries the access token and user, never a refresh token", () => {
  const token = jwt({ sub: "u1", exp: now() + 3600, email: "ada@example.com", user_metadata: { display_name: "Ada" } });
  const body = browserSessionBody(token, "u1");
  assert.deepEqual(Object.keys(body).sort(), ["access_token", "expires_at", "user"]);
  assert.equal(JSON.stringify(body).includes("refresh"), false);
  assert.equal(body.user.email, "ada@example.com");
  assert.equal(body.user.user_metadata.display_name, "Ada");
  const parsed = parseBrowserSession({ ...body, refresh_token: "must-be-dropped" });
  assert.ok(parsed);
  assert.equal(JSON.stringify(parsed).includes("must-be-dropped"), false);
  assert.equal(parseBrowserSession({ access_token: "x" }), null);
});

test("the in-memory session notifies listeners and exposes the old payload shape", () => {
  const seen: unknown[] = [];
  const off = onBrowserSessionChange((s) => seen.push(s?.user.id ?? null));
  setBrowserSession({ accessToken: "a1", expiresAt: now() + 3600, user: { id: "u1", email: null, user_metadata: {} } });
  assert.deepEqual(browserSessionPayload(), { access_token: "a1", user: { id: "u1", email: null, user_metadata: {} } });
  setBrowserSession(null);
  off();
  assert.deepEqual(seen, ["u1", null]);
  assert.equal(browserSessionPayload(), null);
});

test("near expiry the token is renewed by asking the server again, once", async () => {
  let asks = 0;
  setBrowserSession({ accessToken: "old", expiresAt: now() + 30, user: { id: "u1", email: null, user_metadata: {} } });
  setAccessTokenRenewer(async () => {
    asks += 1;
    setBrowserSession({ accessToken: "new", expiresAt: now() + 3600, user: { id: "u1", email: null, user_metadata: {} } });
  });
  assert.equal(await freshAccessToken(), "new");
  assert.equal(await freshAccessToken(), "new");
  assert.equal(asks, 1);
  // A failed renewal keeps the still-valid old token instead of signing the page out.
  setBrowserSession({ accessToken: "old", expiresAt: now() + 30, user: { id: "u1", email: null, user_metadata: {} } });
  setAccessTokenRenewer(async () => { throw new Error("503"); });
  assert.equal(await freshAccessToken(), "old");
  setBrowserSession({ accessToken: "gone", expiresAt: now() - 10, user: { id: "u1", email: null, user_metadata: {} } });
  assert.equal(currentAccessToken(), null);
  setAccessTokenRenewer(null);
  setBrowserSession(null);
  assert.equal(await freshAccessToken(), null);
});
