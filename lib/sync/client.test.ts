import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemorySyncClient, createSupabaseSyncClient } from "./client.ts";
import { SYNC_TABLE } from "./types.ts";

test("memory client round-trips upsert/get/list and records writes", async () => {
  const api = createMemorySyncClient();
  const saved = await api.upsert({
    kind: "chat-session",
    client_id: "s1",
    payload: { v: 1 },
    deleted: false,
  });
  assert.equal(saved.error, null);
  const got = await api.get("chat-session", "s1");
  assert.equal(got.data?.client_id, "s1");
  const listed = await api.list(["chat-session"]);
  assert.equal(listed.data.length, 1);
  assert.equal(api.upserts[0]?.kind, "chat-session");
});

test("Supabase reads canonical owner rows and sends writes through quota-enforcing BFF", async (context) => {
  const tables: string[] = [];
  const result = { data: [], error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    range: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  const sb = {
    from(table: string) {
      tables.push(table);
      return builder;
    },
  };
  const api = createSupabaseSyncClient(sb as never, "user-1");
  const requests: Array<{url: string; init?: RequestInit}> = [];
  context.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    requests.push({url,init});
    const body=JSON.parse(String(init?.body??'{}'));
    return Response.json(body.operation==='prepare'?{chunks:[]}:{kind:"document",client_id:"d1",payload:{},deleted:false,revision:1});
  });
  await api.list(["chat-session", "artifact"]);
  await api.get("artifact", "a1");
  await api.upsert({ kind: "document", client_id: "d1", payload: {}, deleted: false });
  assert.equal(tables.length, 2);
  assert.ok(tables.every((table) => table === SYNC_TABLE));
  assert.equal(SYNC_TABLE,"ss_sync_documents");
  assert.equal(requests[0].url,"/api/assets/versions");
  assert.equal(requests[0].init?.credentials,"include");
  const body=JSON.parse(String(requests[0].init?.body));assert.equal(body.operation,'prepare');assert.equal(body.kind,'document');assert.equal(body.expectedRevision,0);assert.ok(body.mutationId);assert.equal(JSON.parse(String(requests[1].init?.body)).operation,'commit');
});
