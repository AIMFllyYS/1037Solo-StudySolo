import assert from "node:assert/strict";
import test from "node:test";
import { connectorResponseText, connectorResponseJson } from "./response.server";

test("chunked OAuth response exceeding its byte limit cancels before remaining data is read", async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(9)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(connectorResponseText(new Response(body, { headers: { "content-length": "1" } }), 8), /provider_response_too_large/);
  assert.equal(pulls, 1);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("declared oversized or unsuccessful provider responses cancel without reading", async () => {
  for (const options of [{ headers: { "content-length": "65537" } }, { status: 401 }]) {
    let pulls = 0, cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    await assert.rejects(connectorResponseText(new Response(body, options), 65536), /provider_response_unavailable/);
    assert.equal(pulls, 0);
    assert.equal(cancelled, true);
  }
});

test("provider UTF-8 bytes retain split characters and malformed bodies never become identities", async () => {
  const bytes = new TextEncoder().encode('{"label":"学习"}');
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, 12)); controller.enqueue(bytes.slice(12)); controller.close(); } });
  assert.deepEqual(await connectorResponseJson(new Response(body), bytes.length), { label: "学习" });
  await assert.rejects(connectorResponseJson(new Response(new Uint8Array([0xff]))));
  await assert.rejects(connectorResponseJson(Response.json(["unexpected"])), /provider_response_invalid/);
  await assert.rejects(connectorResponseJson(Response.json(null)), /provider_response_invalid/);
});
