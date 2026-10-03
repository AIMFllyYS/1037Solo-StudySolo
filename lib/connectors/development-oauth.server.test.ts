import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { seal, unseal } from "./development-vault.server";
import { developmentCallback, developmentConnect, developmentDashboard, developmentProvider, digest, equalDigest } from "./development-oauth.server";

test("encrypted vault rejects tampering, a different owner context, and a different key", () => {
  const key = randomBytes(32), context = "grant:owner-a:notion";
  const value = { accessToken: "private-fixture-token", refreshToken: "private-fixture-refresh" };
  const encoded = seal(value, key, context);
  assert.ok(!encoded.includes(value.accessToken));
  assert.deepEqual(unseal(encoded, key, context), value);
  assert.throws(() => unseal(encoded, key, "grant:owner-b:notion"));
  assert.throws(() => unseal(encoded, randomBytes(32), context));
  const changed = JSON.parse(encoded);
  const ciphertext = Buffer.from(changed.ciphertext, "base64"); ciphertext[0] ^= 1;
  changed.ciphertext = ciphertext.toString("base64");
  assert.throws(() => unseal(JSON.stringify(changed), key, context));
});

test("provider and browser binding comparisons reject malformed and mismatched input", () => {
  assert.equal(developmentProvider("microsoft"), null);
  assert.equal(developmentProvider("../google"), null);
  assert.equal(developmentProvider("notion"), "notion");
  assert.equal(equalDigest(digest("a"), digest("a")), true);
  assert.equal(equalDigest(digest("a"), digest("b")), false);
  assert.equal(equalDigest("", ""), false);
});

test("production, cross-origin, signed-out and forged callback requests stop before provider access", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNode = process.env.NODE_ENV, originalOrigin = process.env.CONNECTOR_DEV_CALLBACK_ORIGIN;
  process.env.CONNECTOR_DEV_CALLBACK_ORIGIN = "http://localhost:35349";
  const request = (path: string, method = "GET", origin?: string) => new NextRequest(`http://localhost:35349${path}`, { method, headers: { host: "localhost:35349", ...(origin ? { origin } : {}) } });
  try {
    env.NODE_ENV = "production";
    assert.equal((await developmentDashboard(request("/api/connectors/development/"))).status, 403);
    env.NODE_ENV = "development";
    const csrf = await developmentConnect(request("/api/connectors/notion/connect/", "POST", "https://attacker.example"), "notion");
    assert.equal(csrf.status, 403);
    assert.equal((await csrf.json()).code, "ORIGIN_REJECTED");
    assert.equal((await developmentConnect(request("/api/connectors/notion/connect/", "POST", "http://localhost:35349"), "notion")).status, 401);
    const invalid = await developmentCallback(request("/api/connectors/notion/callback/?code=private-code&state=forged"), "notion");
    assert.equal(invalid.status, 400);
    assert.ok(!(await invalid.text()).includes("private-code"));
    assert.equal(invalid.headers.get("referrer-policy"), "no-referrer");
    assert.equal(invalid.headers.get("cache-control"), "private, no-store");
  } finally {
    if (originalNode === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNode;
    if (originalOrigin === undefined) delete process.env.CONNECTOR_DEV_CALLBACK_ORIGIN; else process.env.CONNECTOR_DEV_CALLBACK_ORIGIN = originalOrigin;
  }
});
