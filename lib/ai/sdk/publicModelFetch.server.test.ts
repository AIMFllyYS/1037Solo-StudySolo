import assert from "node:assert/strict";
import test from "node:test";
import type { LookupAddress } from "node:dns";
import { createPinnedProbeLookup, withFakeDnsFallback } from "@/lib/browser/probeNetwork.server";
import { createPublicModelFetch } from "./publicModelFetch.server";
import { toChatErrorMessage } from "./errorMessage";

test("custom model DNS rejects private, mixed, fake DNS and metadata addresses before HTTP", async () => {
  for (const addresses of [["127.0.0.1"], ["169.254.169.254"], ["198.18.1.2"], ["8.8.8.8", "10.0.0.1"]]) {
    let requested = false;
    const fetcher = createPublicModelFetch("https://model.example/v1", 10000,
      async () => addresses.map(address => ({ address, family: 4 })),
      async () => { requested = true; return Response.json({}); });
    await assert.rejects(fetcher("https://model.example/v1/chat/completions"), /公网连接校验/);
    assert.equal(requested, false);
  }
});

test("fake-DNS-only custom providers are pinned to a public DoH answer before HTTP", async t => {
  t.mock.method(console, "warn", () => {});
  let requested = false;
  const fetcher = createPublicModelFetch(
    "https://model.example/v1",
    10000,
    withFakeDnsFallback(
      async () => [{ address: "198.18.0.1", family: 4 }],
      async () => [{ address: "8.8.8.8", family: 4 }],
    ),
    async () => { requested = true; return Response.json({}); },
  );
  assert.equal((await fetcher("https://model.example/v1/chat/completions")).ok, true);
  assert.equal(requested, true);
});

test("fixed model origin and credential-free URL reject cross-origin SDK requests", async () => {
  const fetcher = createPublicModelFetch("https://model.example/v1", 10000,
    async () => [{ address: "8.8.8.8", family: 4 }], async () => { assert.fail("untrusted destination must not be requested"); });
  await assert.rejects(fetcher("https://other.example/v1/chat/completions"), /公网连接校验/);
  await assert.rejects(fetcher("https://userinfo:fixture@model.example/v1/chat/completions"), /公网连接校验/);
});

test("model transport keeps streaming bytes, rejects redirects and removes forged routing headers", async () => {
  const encoded = new TextEncoder().encode("data: 学习\n\ndata: [DONE]\n\n");
  let captured: RequestInit | undefined;
  const fetcher = createPublicModelFetch("https://model.example/v1", 10000,
    async () => [{ address: "8.8.8.8", family: 4 }], async (_input, init) => {
      captured = init;
      return new Response(encoded, { headers: { "content-type": "text/event-stream" } });
    });
  const response = await fetcher("https://model.example/v1/chat/completions", { method: "POST", headers: { Host: "metadata.internal", "Proxy-Authorization": "synthetic-proxy-token", Authorization: "Bearer synthetic-user-key" }, body: "{}" });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), encoded);
  assert.equal(captured?.redirect, "error");
  assert.equal(new Headers(captured?.headers).get("host"), null);
  assert.equal(new Headers(captured?.headers).get("proxy-authorization"), null);
  assert.equal(new Headers(captured?.headers).get("authorization"), "Bearer synthetic-user-key");
  let cancelled = false;
  const redirectBody = new ReadableStream({ cancel() { cancelled = true; } });
  const redirecting = createPublicModelFetch("https://model.example/v1", 10000,
    async () => [{ address: "8.8.8.8", family: 4 }], async () => new Response(redirectBody, { status: 302, headers: { location: "http://169.254.169.254/" } }));
  await assert.rejects(redirecting("https://model.example/v1/chat/completions"), /重定向/);
  assert.equal(cancelled, true);
});

test("pinned model lookup ignores later DNS mutation and cancels body readers", async () => {
  const addresses: LookupAddress[] = [{ address: "8.8.8.8", family: 4 }];
  const lookup = createPinnedProbeLookup("model.example", addresses);
  addresses[0].address = "127.0.0.1";
  await new Promise<void>((resolve, reject) => lookup("model.example", { family: 4, hints: 0, all: false }, (error, address) => {
    if (error) reject(error); else { assert.equal(address, "8.8.8.8"); resolve(); }
  }));
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const fetcher = createPublicModelFetch("https://model.example/v1", 10000, async () => [{ address: "8.8.8.8", family: 4 }], async () => new Response(body));
  const response = await fetcher("https://model.example/v1/chat/completions");
  await response.body!.cancel();
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("cancelled DNS preflight never makes an HTTP call and gives an accurate public error", async () => {
  const controller = new AbortController();
  const fetcher = createPublicModelFetch("https://model.example/v1", 10000, async () => new Promise(() => {}), async () => { assert.fail("aborted preflight sent HTTP"); });
  const pending = fetcher("https://model.example/v1/chat/completions", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => {
    assert.equal((error as { statusCode: number }).statusCode, 403);
    assert.match(toChatErrorMessage(error), /公网连接校验/);
    return true;
  });
});
