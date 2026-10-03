import assert from "node:assert/strict";
import test from "node:test";
import { readRpcResponse } from "./development-discovery.server";

test("MCP parser consumes chunked SSE frames, skips notifications, and accepts only its response id", async () => {
  const encoder = new TextEncoder();
  const source = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"tools":[{"name":"read"}]}}\n\n';
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(source.slice(0, 29)));
    controller.enqueue(encoder.encode(source.slice(29, 100)));
    controller.enqueue(encoder.encode(source.slice(100))); controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
  assert.deepEqual(await readRpcResponse(response, 7), { tools: [{ name: "read" }] });
});

test("MCP parser rejects protocol errors, mismatched ids, and oversized metadata without copying error payloads", async () => {
  const rpc = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  await assert.rejects(readRpcResponse(rpc({ jsonrpc: "2.0", id: 1, error: { message: "private-error-fixture" } }), 1), /^Error: mcp_metadata_rejected$/);
  await assert.rejects(readRpcResponse(rpc({ jsonrpc: "2.0", id: 2, result: {} }), 1), /^Error: mcp_metadata_missing$/);
  await assert.rejects(readRpcResponse(rpc({ jsonrpc: "2.0", id: 1, result: { text: "x".repeat(524288) } }), 1), /^Error: mcp_metadata_too_large$/);
});
