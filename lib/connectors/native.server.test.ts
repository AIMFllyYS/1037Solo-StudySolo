import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { readRecord, readVersionedRecord, compareRecord, writeRecord, acquireLease } from "./persistence.server";
import { activeGrant, readGrant, disconnectConnector, connectionStatus } from "./connections.server";
import { proposeAction, confirmAction, getAction, cancelAction, connectorOperations, readConnector } from "./service.server";
import { gmailMime, eventBody } from "./api.server";
import { allowedMcpTool, validateArguments } from "./mcp.server";
import { connectorOwner } from "./actor.server";
import { ankiTsv } from "./anki";
import type { ConnectorGrant } from "./connections.server";

const owner = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
function grant(provider: "google" | "todoist", scope: string, expiresAt: number | null = null): ConnectorGrant { return { owner, provider, accountId: "fixture-account", accountLabel: "sender@example.test", accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresAt, scope, issuer: "https://accounts.google.com", callback: "http://localhost:35349/api/connectors/google/callback/", createdAt: "2026-10-03T00:00:00Z", defaultWritePolicy: "disabled" }; }

test("native authorization, refresh, action replay and export contracts", async t => {
  const before = process.cwd(), directory = mkdtempSync(join(tmpdir(), "studysolo-native-connectors-")), env = process.env as Record<string, string | undefined>;
  const previous = { NODE_ENV: env.NODE_ENV, CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY, CONNECTOR_DEV_CALLBACK_ORIGIN: env.CONNECTOR_DEV_CALLBACK_ORIGIN, GOOGLE_CONNECTOR_CLIENT_ID: env.GOOGLE_CONNECTOR_CLIENT_ID, GOOGLE_CONNECTOR_CLIENT_SECRET: env.GOOGLE_CONNECTOR_CLIENT_SECRET, GOOGLE_CONNECTOR_SCOPES: env.GOOGLE_CONNECTOR_SCOPES };
  process.chdir(directory); env.NODE_ENV = "test"; env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); env.CONNECTOR_DEV_CALLBACK_ORIGIN = "http://localhost:35349"; env.GOOGLE_CONNECTOR_CLIENT_ID = "fixture.apps.googleusercontent.com"; env.GOOGLE_CONNECTOR_CLIENT_SECRET = "fixture-client-secret"; env.GOOGLE_CONNECTOR_SCOPES = "https://www.googleapis.com/auth/gmail.send";
  try {
    await t.test("leases serialize across calls and release without deleting history", async () => {
      const release = await acquireLease("refresh:fixture"); assert.ok(release); assert.equal(await acquireLease("refresh:fixture"), null); await release(); const again = await acquireLease("refresh:fixture"); assert.ok(again); await again();
    });
    await t.test("optimistic commits never overwrite a newer connection or revocation", async () => {
      await writeRecord("fixture-version", { owner, state: "initial" });
      const old = (await readVersionedRecord("fixture-version"))!;
      await writeRecord("fixture-version", { owner, state: "revoked" });
      assert.equal(await compareRecord("fixture-version", old.revision, { owner, state: "stale-refresh" }), false);
      assert.deepEqual(await readRecord("fixture-version"), { owner, state: "revoked" });
      const current = (await readVersionedRecord("fixture-version"))!;
      assert.equal(await compareRecord("fixture-version", current.revision, { owner, state: "current" }), true);
    });
    await t.test("current identity comes only from Account introspection", async st => {
      st.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => { assert.equal(new Headers(init?.headers).get("authorization"), "Bearer account-fixture"); return Response.json({ active: true, user_id: owner, mfa_required: false, mfa_enrolled: false }); });
      const request = new NextRequest("http://localhost:35349/api/connectors", { headers: { host: "localhost:35349", authorization: "Bearer account-fixture", "x-studyreview-user-id": other } });
      assert.equal(await connectorOwner(request), owner); st.mock.restoreAll();
    });
    await t.test("concurrent refresh rotates once, preserves optional refresh and scope fields", async st => {
      await writeRecord(`grant:${owner}:google`, grant("google", "https://www.googleapis.com/auth/gmail.send", Date.now() - 1000));
      let refreshes = 0;
      st.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => { assert.equal(String(url), "https://oauth2.googleapis.com/token"); assert.ok(String(init?.body).includes("refresh_token=fixture-refresh")); refreshes++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ access_token: "rotated-fixture-access", token_type: "Bearer", expires_in: 3600 }); });
      const result = await Promise.all([activeGrant(owner, "google"), activeGrant(owner, "google")]);
      assert.equal(refreshes, 1); assert.equal(result[0].accessToken, result[1].accessToken); assert.equal(result[0].refreshToken, "fixture-refresh"); assert.equal(result[0].scope, env.GOOGLE_CONNECTOR_SCOPES); st.mock.restoreAll();
    });
    await t.test("proposals cannot send before confirmation; parallel confirmation executes once", async st => {
      let sends = 0;
      st.mock.method(globalThis, "fetch", async (url: string | URL | Request) => { assert.equal(String(url), "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"); sends++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ id: "mail-fixture-id" }); });
      const proposal = await proposeAction(owner, "google", "gmail_send", { to: "recipient@example.test", subject: "fixture subject", body: "fixture body" });
      assert.equal(sends, 0); assert.ok(proposal.action); const id = proposal.action.id;
      await assert.rejects(getAction(other, id), /ACTION_NOT_FOUND/);
      await Promise.all([confirmAction(owner, id), confirmAction(owner, id)]);
      assert.equal(sends, 1); assert.equal((await getAction(owner, id)).status, "succeeded"); await confirmAction(owner, id); assert.equal(sends, 1); st.mock.restoreAll();
    });
    await t.test("cancellation and reconnect stop old proposals before provider execution", async st => {
      let calls = 0; st.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("must not execute"); });
      const proposed = await proposeAction(owner, "google", "gmail_send", { to: "recipient@example.test", subject: "fixture", body: "fixture" });
      await cancelAction(owner, proposed.action!.id); assert.equal((await confirmAction(owner, proposed.action!.id)).status, "cancelled");
      const next = await proposeAction(owner, "google", "gmail_send", { to: "recipient@example.test", subject: "fixture", body: "fixture" });
      await writeRecord(`grant:${owner}:google`, { ...await readGrant(owner, "google"), createdAt: "2026-10-03T01:00:00Z" });
      await assert.rejects(confirmAction(owner, next.action!.id), /CONNECTION_CHANGED/); assert.equal(calls, 0); st.mock.restoreAll();
    });
    await t.test("ambiguous provider outcomes remain uncertain and are never retried", async st => {
      let calls = 0; st.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("private transport failure"); });
      const proposal = await proposeAction(owner, "google", "gmail_send", { to: "recipient@example.test", subject: "fixture", body: "fixture" });
      const result = await confirmAction(owner, proposal.action!.id); assert.equal(result.status, "uncertain"); assert.ok(!JSON.stringify(result).includes("private transport failure")); await confirmAction(owner, proposal.action!.id); assert.equal(calls, 1); st.mock.restoreAll();
    });
    await t.test("disconnect is authoritative locally even if remote revocation fails", async st => {
      st.mock.method(globalThis, "fetch", async () => { await assert.rejects(activeGrant(owner, "google"), /CONNECTION_REQUIRED/); throw new Error("network"); });
      await disconnectConnector(owner, "google"); await assert.rejects(activeGrant(owner, "google"), /CONNECTION_REQUIRED/); st.mock.restoreAll();
    });
    await t.test("status isolates a broken grant and renews another provider without broadening discovery", async st => {
      await writeRecord(`grant:${owner}:google`, grant("google", "https://www.googleapis.com/auth/gmail.send", Date.now() - 1000));
      await writeRecord(`grant:${owner}:todoist`, { ...grant("todoist", "data:read_write"), owner: other });
      let refreshes = 0;
      st.mock.method(globalThis, "fetch", async () => { refreshes++; return Response.json({ access_token: "fixture-status-rotated", token_type: "Bearer", expires_in: 3600 }); });
      const status = await connectionStatus(owner);
      assert.equal(status.find(item => item.provider === "google")?.state, "connected");
      assert.equal(status.find(item => item.provider === "todoist")?.state, "unavailable");
      assert.equal(status.find(item => item.provider === "pubmed")?.state, "available");
      assert.equal(refreshes, 1);
      assert.deepEqual((await connectorOperations(owner, "google")).map(item => item.name), ["gmail_send"]);
      await writeRecord(`grant:${owner}:google`, grant("google", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"));
      assert.deepEqual((await connectorOperations(owner, "google")).map(item => item.name), ["calendar_list_events"]);
      st.mock.restoreAll();
    });
    await t.test("a provider-expired credential becomes reauthorization-required and retains local disconnect", async st => {
      await writeRecord(`grant:${owner}:google`, grant("google", "https://www.googleapis.com/auth/gmail.readonly"));
      st.mock.method(globalThis, "fetch", async () => Response.json({ error: "fixture-expired" }, { status: 401 }));
      await assert.rejects(readConnector(owner, "google", "gmail_search", { query: "fixture" }), /PROVIDER_AUTHORIZATION_EXPIRED/);
      const state = (await connectionStatus(owner)).find(item => item.provider === "google");
      assert.equal(state?.state, "reauthorization_required"); assert.equal(state?.canDisconnect, true);
      st.mock.restoreAll();
    });
    await t.test("opaque grant version is stable across token renewal and changes with a real binding or scope change", async st => {
      const initial = grant("google", "https://www.googleapis.com/auth/calendar.readonly", Date.now() + 3600000);
      await writeRecord(`grant:${owner}:google`, initial);
      const before = (await connectionStatus(owner)).find(item => item.provider === "google")!;
      assert.match(before.grantVersion!, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(before).includes(initial.accessToken));
      await writeRecord(`grant:${owner}:google`, { ...initial, expiresAt: Date.now() - 1000 });
      st.mock.method(globalThis, "fetch", async () => Response.json({ access_token: "fixture-version-renewed", token_type: "Bearer", expires_in: 3600 }));
      await activeGrant(owner, "google");
      assert.equal((await connectionStatus(owner)).find(item => item.provider === "google")!.grantVersion, before.grantVersion);
      await writeRecord(`grant:${owner}:google`, { ...initial, createdAt: "2026-10-04T11:00:00Z" });
      assert.notEqual((await connectionStatus(owner)).find(item => item.provider === "google")!.grantVersion, before.grantVersion);
      await writeRecord(`grant:${owner}:google`, { ...initial, scope: "https://www.googleapis.com/auth/gmail.readonly" });
      assert.notEqual((await connectionStatus(owner)).find(item => item.provider === "google")!.grantVersion, before.grantVersion);
      assert.deepEqual((await connectorOperations(owner, "google")).map(item => item.name), ["gmail_search", "gmail_read"]);
      st.mock.restoreAll();
    });
    await t.test("unknown/destructive MCP tools and secret-shaped arguments are denied", () => {
      assert.equal(allowedMcpTool("todoist", "delete-tasks", true), false); assert.equal(allowedMcpTool("github", "create_issue", true), false); assert.equal(allowedMcpTool("notion", "unknown-new-tool", false), false);
      assert.throws(() => validateArguments({ type: "object" }, { access_token: "fixture" }), /INVALID_ARGUMENTS/);
      assert.throws(() => validateArguments({ type: "object", required: ["id"], properties: { id: { type: "string" } } }, {}), /INVALID_ARGUMENTS/);
    });
    await t.test("official MCP JSON Schema dialects preserve constraints and fail closed", () => {
      const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { title: { type: "string" }, mode: { enum: Array.from({ length: 101 }, (_, i) => `mode-${i}`) } }, required: ["title", "mode"], additionalProperties: false };
      validateArguments(schema, { title: "study", mode: "mode-100" });
      assert.throws(() => validateArguments(schema, { title: 3, mode: "mode-100" }), /INVALID_ARGUMENTS/);
      assert.throws(() => validateArguments(schema, { title: "study", mode: "unknown" }), /INVALID_ARGUMENTS/);
      assert.throws(() => validateArguments({ $schema: "https://untrusted.example/schema", type: "object" }, {}), /PROVIDER_SCHEMA_UNSUPPORTED/);
      assert.throws(() => validateArguments({ $ref: "https://untrusted.example/remote" }, {}), /PROVIDER_SCHEMA_UNSUPPORTED/);
      validateArguments({ $schema: "https://json-schema.org/draft/2019-09/schema", type: "object", unevaluatedProperties: false }, {});
    });
    await t.test("email headers cannot be injected; calendar duration and timezone are checked", () => {
      assert.throws(() => gmailMime({ to: "recipient@example.test\r\nBcc: other@example.test", subject: "fixture", body: "" }), /INVALID_EMAIL/);
      assert.throws(() => gmailMime({ to: "recipient@example.test", subject: "x\r\nBcc: other@example.test", body: "" }), /INVALID_EMAIL/);
      assert.throws(() => eventBody({ summary: "study", start: "2026-10-03T10:00:00Z", end: "2026-10-03T09:00:00Z", timeZone: "UTC" }, "fixture"), /INVALID_EVENT_TIME/);
    });
    await t.test("Anki export has stable GUIDs, escapes HTML and keeps complete field content", async () => {
      const card = { id: "fixture-id", front: "<script>fixture</script>\tquestion", back: "answer\nline", status: "ready" };
      const first = await ankiTsv([card]), second = await ankiTsv([{ ...card, back: "updated" }]);
      assert.ok(first.includes("&lt;script&gt;")); assert.ok(!first.includes("<script>")); assert.ok(first.includes("answer<br>line")); assert.equal(first.split("\n")[7].split("\t")[0], second.split("\n")[7].split("\t")[0]);
      assert.ok((await ankiTsv([{ ...card, status: "saved" }])).split("\n").filter(line => !line.startsWith("#") && line).length === 0);
    });
    assert.equal(await readRecord(`grant:${other}:google`), null);
  } finally {
    process.chdir(before); for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete env[name]; else env[name] = value; }
    // Test fixtures contain no real credentials. Preserve temporary records for failed-test inspection.
  }
});
