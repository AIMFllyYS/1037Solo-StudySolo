import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { developmentConnect } from "./development-oauth.server";
import { createRecordOnce, readRecord } from "./persistence.server";

test("concurrent first authorizations cannot replace a shared OAuth client used for refresh", { timeout: 10000 }, async t => {
  const originalDirectory = process.cwd();
  const root = resolve(".local-archive/connectors-private");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const fixture = await mkdtemp(join(root, "oauth-client-lease-fixture-"));
  const env = process.env as Record<string, string | undefined>;
  const names = ["NODE_ENV", "CONNECTOR_DEV_CALLBACK_ORIGIN", "CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY", "ACCOUNT_BACKEND_URL"];
  const original = Object.fromEntries(names.map(name => [name, env[name]]));
  Object.assign(env, { NODE_ENV: "development", CONNECTOR_DEV_CALLBACK_ORIGIN: "http://localhost:49193",
    CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"), ACCOUNT_BACKEND_URL: "http://localhost:49194" });
  process.chdir(fixture);
  let registrations = 0;
  let started!: () => void;
  const registrationStarted = new Promise<void>(resolve => { started = resolve; });
  let release!: () => void;
  const registrationGate = new Promise<void>(resolve => { release = resolve; });
  let first: Promise<Response> | undefined;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/introspect")) {
      return Response.json({ active: true, user_id: "11111111-1111-4111-8111-111111111111",
        mfa_required: false, mfa_enrolled: false, exp: Math.floor(Date.now() / 1000) + 3600 });
    }
    if (url === "https://mcp.notion.com/.well-known/oauth-authorization-server") {
      return Response.json({ issuer: "https://mcp.notion.com/", authorization_endpoint: "https://mcp.notion.com/authorize",
        token_endpoint: "https://mcp.notion.com/token", registration_endpoint: "https://mcp.notion.com/register",
        code_challenge_methods_supported: ["S256"] });
    }
    assert.equal(url, "https://mcp.notion.com/register");
    assert.equal(init?.method, "POST");
    registrations++;
    started();
    await registrationGate;
    return Response.json({ client_id: "synthetic-shared-client", token_endpoint_auth_method: "none" });
  });
  const request = () => new NextRequest("http://localhost:49193/api/connectors/notion/connect/", {
    method: "POST", headers: { host: "localhost:49193", origin: "http://localhost:49193", authorization: "Bearer synthetic-lease-fixture" },
  });
  try {
    first = developmentConnect(request(), "notion");
    await registrationStarted;
    const competing = await developmentConnect(request(), "notion");
    assert.equal(competing.status, 503);
    assert.equal(registrations, 1);
    release();
    const accepted = await first;
    assert.equal(accepted.status, 200);
    assert.match(await accepted.text(), /synthetic-shared-client/);
    const cached = await developmentConnect(request(), "notion");
    assert.equal(cached.status, 200);
    assert.match(await cached.text(), /synthetic-shared-client/);
    assert.equal(registrations, 1);
  } finally {
    release();
    await first?.catch(() => {});
    process.chdir(originalDirectory);
    for (const name of names) if (original[name] === undefined) delete env[name]; else env[name] = original[name];
  }
});

test("late registrations cannot replace a persisted client after losing their lease", async () => {
  const directory = process.cwd();
  const env = process.env as Record<string, string | undefined>;
  const previous = { NODE_ENV: env.NODE_ENV, CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY };
  const fixture = await mkdtemp(join(resolve(".local-archive/connectors-private"), "oauth-client-once-fixture-"));
  Object.assign(env, { NODE_ENV: "development", CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  process.chdir(fixture);
  try {
    assert.equal(await createRecordOnce("synthetic-client", { clientId: "winning-client" }), true);
    assert.equal(await createRecordOnce("synthetic-client", { clientId: "late-client" }), false);
    assert.deepEqual(await readRecord("synthetic-client"), { clientId: "winning-client" });
    const outcomes = await Promise.all([createRecordOnce("synthetic-concurrent", { clientId: "candidate-a" }), createRecordOnce("synthetic-concurrent", { clientId: "candidate-b" })]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    const winner = await readRecord<{ clientId: string }>("synthetic-concurrent");
    assert.ok(["candidate-a", "candidate-b"].includes(winner!.clientId));
  } finally {
    process.chdir(directory);
    for (const [name, value] of Object.entries(previous)) if (value === undefined) delete env[name]; else env[name] = value;
  }
});
