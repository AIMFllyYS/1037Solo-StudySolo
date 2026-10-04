import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  BoundedLineCollector,
  connectChildOutput,
  INSPECTOR_URL_RE,
  NodeInspectorClient,
  redact,
  waitForInspector,
  waitForProcessExit,
} from "./smoke-packaged-desktop.mjs";

test("inspector line parser captures an endpoint split across stream chunks only after newline", () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const output = connectChildOutput(child);
  const line = "Debugger listening on ws://127.0.0.1:43123/01234567-89ab-cdef";

  child.stderr.write(line.slice(0, 17));
  assert.equal(output.inspectorUrl, null);
  child.stderr.write(line.slice(17, 43));
  assert.equal(output.inspectorUrl, null);
  child.stderr.write(line.slice(43) + "\r");
  assert.equal(output.inspectorUrl, null);
  child.stderr.write("\n");

  assert.equal(output.inspectorUrl, "ws://127.0.0.1:43123/01234567-89ab-cdef");
  assert.equal(output.lines.length, 1);
  assert.doesNotMatch(output.lines[0], /ws:\/\//);
  child.stdout.end();
  child.stderr.end();
});

test("inspector line buffer drops oversized partial lines and resumes at the next line", () => {
  const lines = [];
  const collector = new BoundedLineCollector((line) => lines.push(line), 32);

  collector.write("x".repeat(40));
  assert.equal(collector.pending.length, 0);
  assert.equal(collector.discarding, true);
  collector.write("oversized-tail\nsafe-next-line\n");

  assert.deepEqual(lines, ["safe-next-line"]);
  assert.equal(collector.pending.length, 0);
  assert.equal(collector.discarding, false);
});

test("child startup artifacts redact HTTP and privileged WebSocket inspector URLs", () => {
  const value = redact("http://internal.test/path?sig=one ws://127.0.0.1:1234/inspector-id wss://remote.test/session?token=two");

  assert.doesNotMatch(value, /https?:\/\/|wss?:\/\//);
  assert.doesNotMatch(value, /inspector-id|remote\.test|token=two|sig=one/);
  assert.equal((value.match(/\[REDACTED_URL\]/g) ?? []).length, 3);
});

function minimalNodeEnvironment() {
  const names = process.platform === "win32"
    ? ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC"]
    : ["PATH", "HOME", "TMPDIR"];
  return Object.fromEntries(names.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
}

test("owned Node --inspect child exits normally after quit acknowledgement and inspector disconnect", { timeout: 30_000 }, async () => {
  const child = spawn(process.execPath, [
    "--inspect=0",
    "-e",
    "globalThis.__smokeKeepAlive = setInterval(() => {}, 500)",
  ], {
    env: minimalNodeEnvironment(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = connectChildOutput(child);
  let inspector;

  try {
    const endpoint = await waitForInspector(output, child, 10_000);
    if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(endpoint)) {
      throw new Error("node_inspector_endpoint_must_be_child_loopback");
    }
    assert.ok(INSPECTOR_URL_RE.test("Debugger listening on " + endpoint));
    inspector = await NodeInspectorClient.connect(endpoint);
    await inspector.send("Runtime.enable");
    const response = await inspector.send("Runtime.evaluate", {
      expression: "setImmediate(() => clearInterval(globalThis.__smokeKeepAlive)); 'quit_scheduled'",
      awaitPromise: true,
      returnByValue: true,
    });

    assert.equal(response.result.value, "quit_scheduled");
    await inspector.close();
    assert.equal(await waitForProcessExit(child, 8_000), true);
    assert.equal(child.exitCode, 0);
  } finally {
    await inspector?.close();
    if (child.exitCode === null) {
      child.kill();
      await waitForProcessExit(child, 5_000);
    }
  }
});
