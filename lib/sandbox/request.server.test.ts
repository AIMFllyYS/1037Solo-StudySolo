import assert from "node:assert/strict";
import { test } from "node:test";
import { readSandboxJson } from "./request.server";
import { SandboxError } from "./config.server";

const matches = (code: string, status: number) => (error: unknown) => error instanceof SandboxError && error.code === code && error.status === status;

test("sandbox JSON keeps multibyte text split across network chunks intact", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ content: "中文" }));
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset)); } });
  const request = { headers: new Headers({ "content-type": "application/json; charset=utf-8" }), body } as Request;
  assert.deepEqual(await readSandboxJson(request, bytes.length), { content: "中文" });
});

test("declared oversized input is rejected without consuming its body", async () => {
  const request = {
    headers: new Headers({ "content-type": "application/json", "content-length": "3000" }),
    get body() { throw new Error("body must not be accessed"); },
  } as unknown as Request;
  await assert.rejects(() => readSandboxJson(request, 2000), matches("SANDBOX_REQUEST_TOO_LARGE", 413));
});

test("chunked input is cancelled as soon as actual bytes exceed the limit", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1001)); }, cancel() { cancelled = true; } });
  const request = { headers: new Headers({ "content-type": "application/json" }), body } as Request;
  await assert.rejects(() => readSandboxJson(request, 2000), matches("SANDBOX_REQUEST_TOO_LARGE", 413));
  assert.equal(cancelled, true);
});

test("malformed JSON and unsupported media types produce structured client errors", async () => {
  await assert.rejects(() => readSandboxJson(new Request("https://fixture.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), 2000), matches("SANDBOX_REQUEST_INVALID", 400));
  await assert.rejects(() => readSandboxJson(new Request("https://fixture.invalid", { method: "POST", body: "{}" }), 2000), matches("SANDBOX_JSON_REQUIRED", 415));
});
