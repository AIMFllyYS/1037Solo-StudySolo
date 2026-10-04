import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { authorizeSandbox, assertSandboxScope, sandboxScopeForChat, type SandboxScope } from "./actor.server";
import { sandboxConfiguration, safeRelativePath, SandboxError } from "./config.server";
import { PersistentExecutionStore, type ExecutionStore, type RecordKind } from "./store.server";
import { SandboxService } from "./service.server";
import type { ExecutionProvider, ProviderSession } from "./provider.server";
import type { ArtifactStorage } from "./artifacts.server";
import { createCloudSandboxTool } from "@/lib/ai/agent/tools/cloudSandbox/tool";
import { buildStudyTools, createToolRuntime } from "@/lib/ai/agent/tools/server";
import { maintainExecutions } from "./maintenance.server";
import type { SandboxCommand, SandboxSession, SandboxInput } from "./types";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createStudyAgent } from "@/lib/ai/agent/studyAgent";
import { installedPackages, manageSkillPackage, skillPackageFiles, skillsForAgent, SKILL_RUNTIME_VERSION } from "./skills.server";

const owner = "20000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
function configure() {
  const env = process.env as Record<string, string | undefined>;
  const values = { NODE_ENV: "test", CLOUD_SANDBOX_ENABLED: "true", CLOUD_SANDBOX_REGION: "cn-hangzhou", CLOUD_SANDBOX_DOMAIN: "cn-hangzhou.sandbox.aliyuncs.com", CLOUD_SANDBOX_API_URL: "https://api.cn-hangzhou.sandbox.aliyuncs.com", CLOUD_SANDBOX_API_KEY: "sandbox-fixture-" + "x".repeat(30), CLOUD_SANDBOX_TEMPLATE: "fixture-template", CLOUD_SANDBOX_APP_ORIGIN: "http://localhost:35349", CLOUD_SANDBOX_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), CLOUD_SANDBOX_MONTHLY_BUDGET_CNY: "100", CLOUD_SANDBOX_RUN_BUDGET_CNY: "100" };
  const before = Object.fromEntries(Object.keys(values).map(key => [key, env[key]])); Object.assign(env, values);
  return () => { for (const [key, value] of Object.entries(before)) if (value === undefined) delete env[key]; else env[key] = value; };
}
const request = (path = "/api/agent/chat", referer = "/agent", token = "owner") => new NextRequest(`http://localhost:35349${path}`, { method: "POST", headers: { origin: "http://localhost:35349", referer: `http://localhost:35349${referer}`, authorization: `Bearer ${token}` } });
function authentication(t: TestContext) {
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => Response.json({ active: true, user_id: new Headers(init?.headers).get("authorization") === "Bearer other" ? other : owner, mfa_required: false, mfa_enrolled: false, recent_mfa_at: null, exp: Date.now() / 1000 + 3600 }));
}
class MemoryStore implements ExecutionStore {
  rows = new Map<string, unknown>(); releases = 0; reservations = 0;
  read<T>(kind: RecordKind, id: string, account: string) { return Promise.resolve((this.rows.get(`${kind}:${id}:${account}`) ?? null) as T | null); }
  write(kind: RecordKind, id: string, account: string, value: unknown) { this.rows.set(`${kind}:${id}:${account}`, structuredClone(value)); return Promise.resolve(); }
  owned<T>(kind: RecordKind, account: string) { return Promise.resolve([...this.rows].filter(([key]) => key.startsWith(`${kind}:`) && key.endsWith(`:${account}`)).map(([, value]) => structuredClone(value) as T)); }
  lock<T>(_key: string, work: () => Promise<T>) { return work(); }
  reserve() { this.reservations++; return Promise.resolve(); }
  release() { this.releases++; return Promise.resolve(); }
  async maintenanceSessions() { return [...this.rows].filter(([key]) => key.startsWith("session:")).map(([, value]) => ({ id: (value as SandboxSession).id, owner: (value as SandboxSession).owner })); }
}
class FakeProvider implements ExecutionProvider {
  creates = 0; executes = 0; kills = 0; connects = 0; uncertain = false; emptyLookup = false;
  files = new Map<string, string>();
  providerState: "running" | "paused" | "gone" = "running";
  async getState() { return this.providerState; }
  state = { state: "completed", stdout: "fixture output", stderr: "", exitCode: 0 };
  session: ProviderSession = {
    id: "private-provider-id", initialize: async () => {},
    execute: async () => { this.executes++; return 12; }, poll: async () => ({ ...this.state }), cancel: async () => {},
    write: async (path, text) => { this.files.set(path, text); }, read: async path => new TextEncoder().encode(this.files.get(path) ?? "fixture file"), list: async () => [], kill: async () => { this.kills++; return true; },
  };
  async create() { this.creates++; if (this.uncertain) throw new Error("private-provider-error"); return this.session; }
  async connect() { this.connects++; return this.session; }
  async find() { return this.emptyLookup ? [] : [this.session]; }
  async terminate() { this.kills++; return true; }
}

test("only the actual dedicated main Agent entry mints an execution scope", async t => {
  const restore = configure(); authentication(t);
  try {
    assert.equal(await sandboxScopeForChat(request("/api/chat"), { id: "conversation", agentMain: true }), undefined);
    for (const flags of [{ noteWindowAgent: true }, { planMode: true }, { classContext: {} }, { agentMain: false }]) assert.equal(await sandboxScopeForChat(request(), { id: "conversation", agentMain: true, ...flags }), undefined);
    await assert.rejects(() => authorizeSandbox(request("/api/agent/chat", "/schedule"), "conversation"), (error: unknown) => error instanceof SandboxError && error.code === "AGENT_SURFACE_REQUIRED");
    const scope = await authorizeSandbox(request(), "conversation");
    assertSandboxScope(scope);
    assert.throws(() => assertSandboxScope(JSON.parse(JSON.stringify(scope))));
    const ctx = { subjectId: "probability", categoryId: "detail", itemId: "1.4", skills: [], academicYear: "freshman-2" as const };
    assert.ok(!buildStudyTools(ctx, createToolRuntime(), { enableSearch: false }).cloudSandbox);
    assert.ok(buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, cloudSandboxScope: scope }).cloudSandbox);
    for (const options of [{ noteWindowAgent: true }, { planMode: true }, { disabled: ["cloudSandbox"] }]) assert.ok(!buildStudyTools(ctx, createToolRuntime(), { enableSearch: false, cloudSandboxScope: scope, ...options }).cloudSandbox);
  } finally { restore(); }
});

test("stale recent MFA permits ordinary chat and owned stop/read but checks every actual risky operation", async t => {
  const restore = configure();
  let identityOwner = owner, recent = false, incomplete = false;
  t.mock.method(globalThis, "fetch", async () => Response.json({ active: true, user_id: identityOwner, mfa_required: incomplete, mfa_enrolled: true, recent_mfa_at: recent ? Date.now() / 1000 : Date.now() / 1000 - 700, exp: Date.now() / 1000 + 3600 }));
  try {
    const scope = (await sandboxScopeForChat(request(), { id: "conversation", agentMain: true }))!;
    assert.equal(scope.canExecute, false);
    const store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider), tool = createCloudSandboxTool(scope, service);
    const execute = (input: SandboxInput) => tool.execute!(input, { toolCallId: "fixture", messages: [], context: {} });
    const blocked = await execute({ action: "open" }) as { error: string; authenticationBlocked?: boolean };
    assert.equal(blocked.error, "REAUTH_REQUIRED"); assert.equal(blocked.authenticationBlocked, true); assert.equal(provider.creates, 0);
    recent = true;
    const opened = await execute({ action: "open" }) as { sessionId: string };
    const started = await execute({ action: "exec", sessionId: opened.sessionId, command: "echo fixture" }) as { commandId: string };
    recent = false;
    for (const action of ["exec", "write", "publish"] as const) assert.equal((await execute({ action, sessionId: opened.sessionId, command: "echo forbidden", path: "a", content: "b" }) as { error: string }).error, "REAUTH_REQUIRED");
    assert.equal(provider.executes, 1);
    assert.ok(!(await execute({ action: "read", sessionId: opened.sessionId, path: "a" }) as { error?: string }).error);
    assert.ok(["cancelling", "completed"].includes((await execute({ action: "cancel", sessionId: opened.sessionId, commandId: started.commandId }) as { state: string }).state));
    assert.equal((await execute({ action: "close", sessionId: opened.sessionId }) as { state: string }).state, "closed");
    identityOwner = other; recent = true;
    assert.equal((await execute({ action: "open" }) as { error: string; authenticationBlocked?: boolean }).error, "ACCOUNT_CHANGED");
    assert.equal(provider.creates, 1);
    identityOwner = owner; incomplete = true;
    await assert.rejects(() => sandboxScopeForChat(request(), { id: "conversation", agentMain: true }), /MFA_REQUIRED/);
  } finally { restore(); }
});

test("a missing VM credential does not block the ordinary scope or pretend cloud packages are installed", async t => {
  const restore = configure(); authentication(t);
  try {
    delete process.env.CLOUD_SANDBOX_API_KEY;
    const scope = (await sandboxScopeForChat(request(), { id: "conversation", agentMain: true }))!;
    const custom = { id: "local", name: "Custom", description: "Custom", content: "custom", createdAt: 1, pinned: false };
    let code = "";
    const failingStore = new MemoryStore(); t.mock.method(failingStore, "owned", async () => { throw new SandboxError("SANDBOX_CREDENTIALS_MISSING", 503); });
    const skills = await skillsForAgent(scope, [custom, { ...custom, id: "package", sourceId: "notes-to-handbook" }], failingStore, value => { code = value; });
    assert.deepEqual(skills, [custom]); assert.equal(code, "SANDBOX_CREDENTIALS_MISSING");
    assert.equal((await createCloudSandboxTool(scope).execute!({ action: "open" }, { toolCallId: "fixture", messages: [], context: {} }) as { error: string }).error, "SANDBOX_CREDENTIALS_MISSING");
  } finally { restore(); }
});

test("artifact upload unknown result reserves one identity, recovers exact content and rejects premature/foreign downloads", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider();
    let uploads = 0, inspectFails = false;
    const objects = new Map<string, Uint8Array>();
    const storage: ArtifactStorage = { inspect: async (_path, id) => { if (inspectFails) throw new Error("transport"); return objects.get(id) ?? null; }, upload: async (_path, id, bytes) => { uploads++; objects.set(id, bytes); throw new Error("response lost"); } };
    const service = new SandboxService(store, provider, storage), opened = await service.operate(scope, { action: "open" });
    const first = await service.operate(scope, { action: "publish", sessionId: opened.sessionId, path: "result.txt" });
    assert.equal(first.state, "uncertain"); assert.equal(uploads, 1);
    const manifests = await store.owned<import("./types").SandboxArtifact>("artifact", owner);
    assert.equal(manifests.length, 1); assert.equal(manifests[0].state, "uncertain");
    await assert.rejects(() => service.artifact(scope, manifests[0].id), /SANDBOX_ARTIFACT_NOT_READY/);
    inspectFails = true;
    assert.equal((await service.operate(scope, { action: "publish", sessionId: opened.sessionId, path: "result.txt" })).state, "uncertain");
    assert.equal(uploads, 1);
    inspectFails = false;
    const recovered = await service.operate(scope, { action: "publish", sessionId: opened.sessionId, path: "result.txt" });
    assert.equal(recovered.artifact?.id, manifests[0].id); assert.equal(uploads, 1);
    assert.equal((await service.operate(scope, { action: "publish", sessionId: opened.sessionId, path: "result.txt" })).artifact?.id, manifests[0].id);
    assert.equal((await store.owned("artifact", owner)).length, 1);
    const foreign = await authorizeSandbox(request("/api/agent/chat", "/agent", "other"), "conversation");
    await assert.rejects(() => service.artifact(foreign, manifests[0].id), /SANDBOX_RECORD_NOT_FOUND/);
    await service.operate(scope, { action: "close", sessionId: opened.sessionId });
    assert.equal((await service.artifact(scope, manifests[0].id)).bytes.byteLength, manifests[0].size);
    objects.set(manifests[0].id, new TextEncoder().encode("corrupt"));
    await assert.rejects(() => service.artifact(scope, manifests[0].id), /SANDBOX_ARTIFACT_IDENTITY_MISMATCH/);
  } finally { restore(); }
});

test("server auth tickets preserve the original request and serialize reload/concurrent retries without executing twice", async t => {
  const restore = configure(); authentication(t);
  try {
    class SerializedStore extends MemoryStore {
      gates = new Map<string, Promise<void>>();
      async lock<T>(key: string, work: () => Promise<T>): Promise<T> {
        const prior = this.gates.get(key) ?? Promise.resolve(); let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; }); this.gates.set(key, prior.then(() => gate));
        await prior; try { return await work(); } finally { release(); }
      }
    }
    const scope = await authorizeSandbox(request(), "conversation"), readScope = await authorizeSandbox(request(), "conversation", false), store = new SerializedStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const opened = await service.operate(scope, { action: "open" });
    const input: SandboxInput = { action: "exec", sessionId: opened.sessionId, command: "echo original" };
    const id = await service.prepareAuthRetry(readScope, input, "auth-call");
    input.command = "echo changed";
    assert.equal((await service.authRetryStatus(readScope, id)).input.command, "echo original");
    await assert.rejects(() => service.resumeAuthRetry(readScope, id, async () => { throw new SandboxError("REAUTH_REQUIRED", 403); }), /REAUTH_REQUIRED/);
    assert.equal((await service.authRetryStatus(readScope, id)).state, "proposed"); assert.equal(provider.executes, 0);
    const results = await Promise.all([service.resumeAuthRetry(readScope, id, async () => scope), service.resumeAuthRetry(readScope, id, async () => scope)]);
    assert.equal(results[0].commandId, results[1].commandId); assert.equal(provider.executes, 1);
    assert.equal((await new SandboxService(store, provider).resumeAuthRetry(readScope, id, async () => { throw new Error("no new authorization needed for an already stored read result"); })).commandId, results[0].commandId);
    assert.equal(provider.executes, 1);
    await assert.rejects(() => service.operate(scope, { action: "poll", sessionId: opened.sessionId, commandId: id }), /SANDBOX_RECORD_NOT_FOUND/);
    const foreign = await authorizeSandbox(request("/api/agent/chat", "/agent", "other"), "conversation");
    await assert.rejects(() => service.authRetryStatus(foreign, id), /SANDBOX_RECORD_NOT_FOUND/);
    const wrongConversation = await authorizeSandbox(request(), "wrong");
    await assert.rejects(() => service.resumeAuthRetry(wrongConversation, id, async () => scope), /SANDBOX_RECORD_NOT_FOUND/);
    await service.operate(scope, { action: "close", sessionId: opened.sessionId });
    assert.equal((await service.authRetryStatus(readScope, id)).state, "completed", "cleanup does not mutate ticket as if it were a command");
    const ticket = (await store.read<import("./types").SandboxAuthRetry>("command", id, owner))!;
    await store.write("command", id, owner, { ...ticket, expiresAt: Date.now() - 1 });
    await assert.rejects(() => service.resumeAuthRetry(readScope, id, async () => scope), /SANDBOX_RETRY_EXPIRED/);
    const next = await service.prepareAuthRetry(readScope, { action: "open" }, "uncertain-call"); provider.uncertain = true;
    const uncertain = await service.resumeAuthRetry(readScope, next, async () => scope);
    assert.equal(uncertain.state, "uncertain"); const count = provider.creates;
    assert.equal((await service.resumeAuthRetry(readScope, next, async () => scope)).state, "uncertain");
    assert.equal(provider.creates, count);
  } finally { restore(); }
});

test("server scope rejects foreign owner and conversation before provider access", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), foreign = await authorizeSandbox(request("/api/agent/chat", "/agent", "other"), "conversation"), wrongConversation = await authorizeSandbox(request(), "other-conversation");
    const store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const opened = await service.operate(scope, { action: "open" });
    assert.equal(opened.state, "active"); assert.ok(!JSON.stringify(opened).includes(owner)); assert.ok(!JSON.stringify(opened).includes("private-provider-id"));
    for (const denied of [foreign, wrongConversation]) await assert.rejects(() => service.operate(denied, { action: "exec", sessionId: opened.sessionId, command: "echo forbidden" }), (error: unknown) => error instanceof SandboxError && error.code === "SANDBOX_RECORD_NOT_FOUND");
    assert.equal(provider.executes, 0); assert.equal(provider.connects, 0);
    const executed = await service.operate(scope, { action: "exec", sessionId: opened.sessionId, command: "echo fixture" });
    assert.equal(executed.state, "running"); assert.equal(provider.executes, 1);
    const result = await service.operate(scope, { action: "poll", sessionId: opened.sessionId, commandId: executed.commandId });
    assert.equal(result.exitCode, 0); assert.equal(provider.executes, 1);
    const stopped = await service.operate(scope, { action: "close", sessionId: opened.sessionId });
    assert.equal(stopped.state, "closed"); assert.equal(store.releases, 1);
  } finally { restore(); }
});

test("uncertain create does not allocate again and close reconciles exact metadata", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider(); provider.uncertain = true;
    const service = new SandboxService(store, provider), first = await service.operate(scope, { action: "open" }), second = await service.operate(scope, { action: "open" });
    assert.equal(first.state, "uncertain"); assert.equal(second.sessionId, first.sessionId); assert.equal(provider.creates, 1);
    assert.equal((await service.operate(scope, { action: "close", sessionId: first.sessionId })).state, "closed");
    const tool = createCloudSandboxTool(undefined, service);
    const denied = await tool.execute!({ action: "open" }, { toolCallId: "fixture", messages: [], context: {} });
    assert.equal((denied as { error: string }).error, "AGENT_EXECUTION_NOT_AUTHORIZED"); assert.equal(provider.creates, 1);
  } finally { restore(); }
});

test("budget cap, encrypted AAD and conservative reservations remain authoritative", async () => {
  const restore = configure(), cwd = process.cwd(), directory = await mkdtemp(join(tmpdir(), "studysolo-sandbox-test-")); process.chdir(directory);
  try {
    for (const key of ["CLOUD_SANDBOX_MONTHLY_BUDGET_CNY", "CLOUD_SANDBOX_RUN_BUDGET_CNY"]) assert.throws(() => sandboxConfiguration({ ...process.env, [key]: "101" }));
    assert.throws(() => sandboxConfiguration({ ...process.env, CLOUD_SANDBOX_API_URL: "https://api.e2b.dev" }));
    for (const path of ["../secret", "/etc/passwd", "a\\b", "x\0y"]) assert.throws(() => safeRelativePath(path));
    const store = new PersistentExecutionStore(), id = randomUUID(), expiry = Date.now() + 60000;
    await store.write("session", id, owner, { owner, privateData: "fixture-private-value" }, expiry);
    assert.equal(await store.read("session", id, other), null);
    await store.reserve(id, owner, 300000, expiry);
    await assert.rejects(() => store.reserve(randomUUID(), other, 300000, expiry));
    await store.release(id, owner);
    await store.reserve(randomUUID(), other, 300000, expiry);
    const ledger = JSON.parse(await readFile(join(directory, ".local-archive/connectors-private/sandbox-state/operator-reservations.json"), "utf8"));
    assert.equal(ledger.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0), 600000);
  } finally { process.chdir(cwd); restore(); }
});

test("empty uncertain-create discovery retains uncertainty even after the estimated TTL", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider();
    provider.uncertain = true; provider.emptyLookup = true;
    const service = new SandboxService(store, provider), opened = await service.operate(scope, { action: "open" });
    assert.equal((await service.operate(scope, { action: "close", sessionId: opened.sessionId })).state, "uncertain");
    assert.equal(store.releases, 0);
    assert.equal((await service.operate(scope, { action: "open" })).sessionId, opened.sessionId);
    assert.equal(provider.creates, 1);
    const record = (await store.read<SandboxSession>("session", opened.sessionId!, owner))!;
    await store.write("session", record.id, owner, { ...record, expiresAt: Date.now() - 61000 });
    assert.equal((await maintainExecutions(store, provider)).closed, 0);
    assert.equal(store.releases, 0);
  } finally { restore(); }
});

test("maintenance captures final logs and cached results survive close and provider rotation", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const opened = await service.operate(scope, { action: "open" });
    const started = await service.operate(scope, { action: "exec", sessionId: opened.sessionId, command: "echo fixture" });
    assert.equal((await maintainExecutions(store, provider)).captured, 1);
    const cached = await store.read<SandboxCommand>("command", started.commandId!, owner);
    assert.equal(cached?.result?.stdout, "fixture output");
    await service.operate(scope, { action: "close", sessionId: opened.sessionId });
    const connections = provider.connects;
    process.env.CLOUD_SANDBOX_API_KEY = "rotated-fixture-" + "y".repeat(30);
    assert.equal((await service.operate(scope, { action: "poll", sessionId: opened.sessionId, commandId: started.commandId })).stdout, "fixture output");
    assert.equal(provider.connects, connections);
  } finally { restore(); }
});

test("close directly terminates without pretending unpolled final output was captured", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const opened = await service.operate(scope, { action: "open" });
    const started = await service.operate(scope, { action: "exec", sessionId: opened.sessionId, command: "echo fixture" });
    const connections = provider.connects;
    await service.operate(scope, { action: "close", sessionId: opened.sessionId });
    const result = await service.operate(scope, { action: "poll", sessionId: opened.sessionId, commandId: started.commandId });
    assert.equal(result.stdout, ""); assert.equal(result.exitCode, undefined); assert.equal(result.reason, "sandbox_closed"); assert.equal(provider.connects, connections);
  } finally { restore(); }
});

test("non-recent close never connects to a paused instance just to collect final logs", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), readScope = await authorizeSandbox(request(), "conversation", false), store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const opened = await service.operate(scope, { action: "open" });
    const started = await service.operate(scope, { action: "exec", sessionId: opened.sessionId, command: "echo fixture" });
    const record = (await store.read<SandboxCommand>("command", started.commandId!, owner))!;
    await store.write("command", record.id, owner, { ...record, result: { state: "running", stdout: "last durable log", stderr: "" } });
    provider.providerState = "paused"; const connects = provider.connects;
    assert.equal((await service.operate(readScope, { action: "close", sessionId: opened.sessionId })).state, "closed");
    assert.equal(provider.connects, connects); assert.equal(provider.kills, 1);
    const final = await service.operate(readScope, { action: "poll", sessionId: opened.sessionId, commandId: started.commandId });
    assert.equal(final.stdout, "last durable log"); assert.equal(final.reason, "sandbox_closed");
  } finally { restore(); }
});

test("complete packages require a verified runtime and remain Account-owned", async t => {
  const restore = configure(); authentication(t);
  const oldVersion = process.env.CLOUD_SANDBOX_SKILLS_VERSION, oldTemplate = process.env.CLOUD_SANDBOX_SKILLS_TEMPLATE;
  try {
    const scope = await authorizeSandbox(request(), "conversation"), foreign = await authorizeSandbox(request("/api/agent/chat", "/agent", "other"), "conversation"), store = new MemoryStore();
    await assert.rejects(() => manageSkillPackage(scope, "notes-to-handbook", true, store), /SKILL_RUNTIME_NOT_READY/);
    process.env.CLOUD_SANDBOX_SKILLS_VERSION = SKILL_RUNTIME_VERSION; process.env.CLOUD_SANDBOX_SKILLS_TEMPLATE = process.env.CLOUD_SANDBOX_TEMPLATE;
    const result = await manageSkillPackage(scope, "notes-to-handbook", true, store);
    assert.equal(result.fileCount, 9); assert.ok(result.content.includes("完整原始技能包"));
    assert.equal((await installedPackages(foreign, store)).length, 0);
    assert.equal((await installedPackages(scope, store)).length, 1);
    assert.ok((await skillPackageFiles("gb-standard-docx-pdf")).some(file => file.path === "scripts/render_pdf_pages.py"));
    const clientSkill = { id: "1700000000000-42", name: "Local label", description: "Local label", content: "forged-package-content", pinned: true, createdAt: 1, sourceId: "notes-to-handbook" };
    const loaded = await skillsForAgent(scope, [clientSkill], store);
    assert.equal(loaded[0].id, clientSkill.id);
    assert.equal(loaded[0].pinned, true);
    assert.ok(loaded[0].content.includes("完整原始技能包"));
    assert.ok(!loaded[0].content.includes("forged-package-content"));
    assert.equal((await skillsForAgent(foreign, [clientSkill], store)).length, 0);
    const custom = { ...clientSkill, sourceId: undefined };
    const collided = await skillsForAgent(scope, [custom, clientSkill], store);
    assert.equal(new Set(collided.map(skill => skill.id)).size, collided.length);
    await manageSkillPackage(scope, "notes-to-handbook", false, store);
    assert.equal((await installedPackages(scope, store)).length, 0);
  } finally {
    if (oldVersion === undefined) delete process.env.CLOUD_SANDBOX_SKILLS_VERSION; else process.env.CLOUD_SANDBOX_SKILLS_VERSION = oldVersion;
    if (oldTemplate === undefined) delete process.env.CLOUD_SANDBOX_SKILLS_TEMPLATE; else process.env.CLOUD_SANDBOX_SKILLS_TEMPLATE = oldTemplate;
    restore();
  }
});

test("actual StudyAgent tool loop receives IDs and can execute, poll and close the same session", async t => {
  const restore = configure(); authentication(t);
  try {
    const scope = await authorizeSandbox(request(), "conversation"), store = new MemoryStore(), provider = new FakeProvider(), service = new SandboxService(store, provider);
    const original = SandboxService.prototype.operate;
    t.mock.method(SandboxService.prototype, "operate", (authorized: SandboxScope, input: SandboxInput) => original.call(service, authorized, input));
    let step = 0;
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const model = new MockLanguageModelV4({ doStream: async ({ prompt }) => {
      const values = prompt.flatMap(message => message.role === "tool" ? message.content.map(part => part.type === "tool-result" && part.output.type === "text" ? JSON.parse(part.output.value) : null).filter(Boolean) : []);
      const opened = values.find(value => value.state === "active"), started = values.find(value => value.commandId && value.state === "running");
      let input: Record<string, unknown> = { action: "open" };
      if (step === 1) { assert.ok(opened.sessionId); input = { action: "exec", sessionId: opened.sessionId, command: "echo fixture" }; }
      if (step === 2) { assert.ok(started.commandId); input = { action: "poll", sessionId: opened.sessionId, commandId: started.commandId }; }
      if (step === 3) { assert.ok(values.some(value => value.exitCode === 0)); input = { action: "close", sessionId: opened.sessionId }; }
      const finished = step >= 4;
      const parts: LanguageModelV4StreamPart[] = finished ? [{ type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: "命令完成，沙箱已关闭" }, { type: "text-end", id: "answer" }] : [{ type: "tool-call", toolCallId: `cloud-${step}`, toolName: "cloudSandbox", input: JSON.stringify(input) }];
      step++;
      return { stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([{ type: "stream-start", warnings: [] }, ...parts, { type: "finish", finishReason: { unified: finished ? "stop" : "tool-calls", raw: finished ? "stop" : "tool_calls" }, usage }]) };
    } });
    const { agent } = createStudyAgent({ model, cloudSandboxScope: scope, chatCtx: { subjectId: "probability", categoryId: "detail", itemId: "1.4", currentTopic: "", academicYear: "freshman-2" }, options: { enableSearch: false, enableThinking: false, contextMode: "full" }, disabledTools: [], skills: [], globalContext: "", referenceContext: "", contextTruncated: false, isImageMode: false, modelSupportsTools: true, thinking: {}, maxToolRounds: 8 });
    const result = await agent.stream({ messages: [{ role: "user", content: "执行测试命令并关闭沙箱" }] });
    const chunks = await convertReadableStreamToArray(result.toUIMessageStream());
    assert.equal(chunks.filter(chunk => chunk.type === "tool-output-available").length, 4);
    assert.equal(provider.creates, 1); assert.equal(provider.executes, 1); assert.equal(provider.kills, 1);
    assert.ok(!JSON.stringify(model.doStreamCalls).includes(owner)); assert.ok(!JSON.stringify(chunks).includes("private-provider-id"));
  } finally { restore(); }
});
