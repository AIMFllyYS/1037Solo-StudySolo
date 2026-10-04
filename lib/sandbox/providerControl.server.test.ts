import assert from "node:assert/strict";
import { test } from "node:test";
import { Sandbox } from "e2b";
import { AlibabaExecutionProvider } from "./provider.server";

test("tenant startup configuration cannot run in trusted provider metadata or supervisor commands", async t => {
  const before = { ...process.env };
  Object.assign(process.env, {
    CLOUD_SANDBOX_ENABLED: "true",
    CLOUD_SANDBOX_TEMPLATE: "fixture-headless",
    CLOUD_SANDBOX_API_KEY: `fixture-${"a".repeat(32)}`,
    CLOUD_SANDBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    CLOUD_SANDBOX_APP_ORIGIN: "http://localhost:35349",
    NODE_ENV: "test",
  });
  let startupCodeRan = false;
  const calls: Array<{ command: string; user?: string }> = [];
  const fake = {
    sandboxId: "fixture-instance",
    getInfo: async () => ({ cpuCount: 2, memoryMB: 2048, allowInternetAccess: false, templateId: "fixture-headless", metadata: { application: "StudySolo" } }),
    commands: {
      run: async (command: string, options: { user?: string }) => {
        calls.push({ command, user: options.user });
        // Model the two dangerous entry points: writable user shell startup,
        // and Python's automatic cwd/user-site startup imports without -I.
        if (options.user !== "root" || command.includes("python3") && !command.includes("/usr/bin/python3 -I")) startupCodeRan = true;
        return { exitCode: 0, stdout: command.includes("base=sys.argv[1]") ? "/home/studysolo/workspace\n" : "", pid: 200, disconnect: async () => {} };
      },
    },
    files: {
      write: async (_path: unknown, _content: unknown, options: { user?: string }) => { assert.ok(["root", "studysolo"].includes(options.user ?? "")); },
      getInfo: async () => ({ type: "file", size: 5 }),
      read: async (_path: string, options: { user?: string }) => { assert.equal(options.user, "studysolo"); return new TextEncoder().encode("hello"); },
    },
  };
  t.mock.method(Sandbox, "create", async () => fake as unknown as Sandbox);
  try {
    const session = await new AlibabaExecutionProvider().create("fixture-execution", "fixture-scope");
    await session.initialize();
    await session.execute("11111111-1111-4111-8111-111111111111", "echo hello", ".", 10);
    assert.equal(new TextDecoder().decode(await session.read("hello.txt")), "hello");
    assert.equal(startupCodeRan, false);
    assert.ok(calls.some(call => call.command.includes("base=sys.argv[1]")));
    assert.ok(calls.some(call => call.command.includes("/worker.py")));
    assert.ok(calls.every(call => call.user === "root"));
    const count = calls.length;
    await assert.rejects(() => session.read("../outside"), /SANDBOX_PATH_INVALID/);
    assert.equal(calls.length, count);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

test("unknown-create reconciliation enumerates paused and running instances without auto-resuming", async t => {
  const before = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "test", CLOUD_SANDBOX_ENABLED: "true", CLOUD_SANDBOX_TEMPLATE: "fixture", CLOUD_SANDBOX_API_KEY: `fixture-${"a".repeat(32)}`, CLOUD_SANDBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") });
  let page = 0, connects = 0; const deleted: string[] = [];
  const pages = [[{ sandboxId: "paused-owned", metadata: { application: "StudySolo", executionId: "wanted", scope: "scope" } }], [{ sandboxId: "foreign", metadata: { application: "StudySolo", executionId: "other", scope: "scope" } }]];
  t.mock.method(Sandbox, "list", (options: { query: { state: string[] } }) => {
    assert.deepEqual(options.query.state, ["running", "paused"]);
    return { get hasNext() { return page < pages.length; }, nextItems: async () => pages[page++] };
  });
  t.mock.method(Sandbox, "connect", async () => { connects++; throw new Error("must not resume"); });
  t.mock.method(Sandbox, "kill", async (id: string) => { deleted.push(id); return false; });
  try {
    const found = await new AlibabaExecutionProvider().find("wanted", "scope", 1000);
    assert.equal(found.length, 1); assert.equal(connects, 0); assert.equal(await found[0].kill(), true); assert.deepEqual(deleted, ["paused-owned"]);
    t.mock.method(Sandbox, "list", () => ({ hasNext: true, nextItems: async () => [] }));
    await assert.rejects(() => new AlibabaExecutionProvider().find("wanted", "scope", 1000), /SANDBOX_DISCOVERY_INCOMPLETE/);
  } finally { for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); }
});

test("read/cancel connections reject an exactly paused instance before SDK connect can resume it", async t => {
  const before = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "test", CLOUD_SANDBOX_ENABLED: "true", CLOUD_SANDBOX_TEMPLATE: "fixture", CLOUD_SANDBOX_API_KEY: `fixture-${"a".repeat(32)}`, CLOUD_SANDBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") });
  let connects = 0;
  t.mock.method(Sandbox, "getInfo", async () => ({ state: "paused", metadata: { application: "StudySolo" } }));
  t.mock.method(Sandbox, "connect", async () => { connects++; throw new Error("must not resume"); });
  try {
    await assert.rejects(() => new AlibabaExecutionProvider().connect("exact-paused-instance", 1000), /SANDBOX_NOT_RUNNING/);
    assert.equal(connects, 0);
  } finally { for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); }
});
